import { checkDangerous, checkFilePath } from '../security.js';
import { compressOldOutputs, shouldCompress, smartTruncate } from '../truncate.js';
import { toolSchemas, getToolHandler, getToolDetail, getToolOperation } from './tools/index.js';
import { createProvider, getCapabilities, detectProvider } from './provider.js';

export class Agent {
  constructor(options = {}) {
    this.model = options.model || process.env.OPENAI_MODEL_NAME || 'z-ai/glm-4.5-air:free';
    this.debug = options.debug || process.env.DEBUG === 'true';
    this.provider = options.provider || detectProvider(this.model);
    this.client = createProvider({
      model: this.model,
      provider: this.provider
    });
    this.caps = getCapabilities(this.model);
    this.messages = [
      { role: "system", content: "你是一个可以调用bash工具的AI" }
    ];
    this.tools = toolSchemas;
  }

  log(...args) {
    this.debug && console.log(...args);
  }

  async _executeTool(toolName, args) {
    const handler = getToolHandler(toolName);
    if (!handler) return `未知工具: ${toolName}`;

    if (toolName === 'bash') {
      const timeout = args.timeout ?? 60;
      const rawResult = await handler(args.command, timeout);
      return smartTruncate(args.command, rawResult);
    } else if (toolName === 'read_file') {
      return handler(args.path, args.offset, args.limit);
    } else if (toolName === 'write_file') {
      return handler(args.path, args.content);
    } else if (toolName === 'edit_file') {
      return handler(args.path, args.operation, args.start, args.end, args.content);
    } else if (toolName === 'glob') {
      return handler(args.pattern, args.path, args.limit);
    } else if (toolName === 'grep') {
      return handler(args.pattern, args.output_mode, args.type, args.context, args.path);
    } else if (toolName === 'todo') {
      return handler(args.operation, args, process.cwd());
    } else if (toolName === 'subagent') {
      const subResult = await handler(args.task, args.context, {
        model: this.model,
        provider: this.provider,
        debug: this.debug
      });
      return subResult.success ? subResult.content : `子代理执行失败: ${subResult.content}`;
    }

    return `未知工具: ${toolName}`;
  }

  async _runToolLoop(initialMsg, callbacks = {}, skipSafetyCheck = false) {
    const { onThinking, onToolStart, onToolEnd } = callbacks;
    let msg = initialMsg;

    while (msg.tool_calls) {
      this.log('[DEBUG] 检测到工具调用:', msg.tool_calls.length, '个');

      this.messages.push(msg);

      for (const toolCall of msg.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const toolName = toolCall.function.name;
        const detail = getToolDetail(toolName, args);

        onToolStart?.(toolName, detail);

        let result;
        let shouldSkip = false;

        if (!skipSafetyCheck) {
          if (toolName === 'bash') {
            const cmdDanger = checkDangerous(args.command);
            if (cmdDanger.dangerous) {
              if (cmdDanger.level === 'critical') {
                result = `⛔ 已拦截危险操作: ${cmdDanger.msg}\n此操作被禁止执行。`;
                shouldSkip = true;
              } else {
                return {
                  type: 'confirm',
                  operation: args.command,
                  message: cmdDanger.msg,
                  toolCall,
                  reason: 'bash'
                };
              }
            }
          } else {
            const operation = getToolOperation(toolName, args);
            const pathDanger = checkFilePath(args.path, operation);
            if (pathDanger.dangerous) {
              if (pathDanger.level === 'critical') {
                result = `⛔ 已拦截危险操作: ${pathDanger.msg}\n此操作被禁止执行。`;
                shouldSkip = true;
              } else {
                return {
                  type: 'confirm',
                  operation: `${operation} ${args.path}`,
                  message: pathDanger.msg,
                  toolCall,
                  reason: 'file'
                };
              }
            }
          }
        }

        if (!shouldSkip) {
          result = await this._executeTool(toolName, args);
        }

        if (shouldSkip) {
          onToolEnd?.(toolName, 'error', '操作已取消');
        } else {
          onToolEnd?.(toolName, 'done', `工具执行完成: ${toolName}`);
        }

        this.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id
        });
      }

      onThinking?.();
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: this.messages,
          tools: this.tools
        });
        msg = response.choices[0].message;
      } catch (error) {
        return { type: 'error', message: error.message };
      }
    }

    return { type: 'done', msg };
  }

  async sendMessage(userInput, callbacks = {}) {
    const { onThinking, onResponse, onError } = callbacks;

    const trimmed = userInput.trim().toLowerCase();
    if (trimmed === 'exit' || trimmed === 'exit()') {
      return { type: 'exit' };
    }

    const userDanger = checkDangerous(userInput);
    if (userDanger.dangerous) {
      if (userDanger.level === 'critical') {
        return { type: 'error', message: `⛔ 已拦截危险操作: ${userDanger.msg}\n此操作被禁止执行。` };
      }
      return { type: 'confirm', operation: userInput, message: userDanger.msg };
    }

    this.messages.push({ role: 'user', content: userInput });
    onThinking?.();

    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: this.tools
      });
    } catch (error) {
      onError?.(error);
      return { type: 'error', message: error.message };
    }

    const loopResult = await this._runToolLoop(response.choices[0].message, callbacks);
    if (loopResult.type !== 'done') return loopResult;

    const msg = loopResult.msg;
    this.messages.push(msg);
    onResponse?.(msg.content);

    const compressionInfo = shouldCompress(this.messages);
    if (compressionInfo.shouldCompress) {
      this.messages = compressOldOutputs(this.messages, 3);
    }

    return { type: 'response', content: msg.content };
  }

  async confirmOperation(operation, message) {
    this.messages.push({
      role: 'user',
      content: `用户确认执行危险操作: ${operation}`
    });

    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: this.tools
      });
    } catch (error) {
      return { type: 'error', message: error.message };
    }

    const loopResult = await this._runToolLoop(response.choices[0].message, {}, true);
    if (loopResult.type !== 'done') return loopResult;

    const msg = loopResult.msg;
    this.messages.push(msg);
    return { type: 'response', content: msg.content };
  }

  getMessages() {
    return this.messages;
  }

  setMessages(msgs) {
    this.messages = msgs;
  }

  setModel(model) {
    this.model = model;
    this.provider = detectProvider(model);
    this.caps = getCapabilities(model);
    this.client = createProvider({
      model: this.model,
      provider: this.provider
    });
  }

  getProvider() {
    return this.provider;
  }

  getCapabilities() {
    return this.caps;
  }
}
