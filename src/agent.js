import OpenAI from "openai";
import { checkDangerous, checkFilePath } from '../security.js';
import { compressOldOutputs, shouldCompress, smartTruncate } from '../truncate.js';
import { toolSchemas, getToolHandler, getToolDetail, getToolOperation } from './tools/index.js';

export class Agent {
  constructor(options = {}) {
    this.model = options.model || process.env.OPENAI_MODEL_NAME || 'z-ai/glm-4.5-air:free';
    this.debug = options.debug || process.env.DEBUG === 'true';
    this.client = new OpenAI();
    this.messages = [
      { role: "system", content: "你是一个可以调用bash工具的AI" }
    ];
    this.tools = toolSchemas;
  }

  log(...args) {
    this.debug && console.log(...args);
  }

  async sendMessage(userInput, callbacks = {}) {
    const { onThinking, onToolStart, onToolEnd, onResponse, onError } = callbacks;

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

    let msg = response.choices[0].message;

    while (msg.tool_calls) {
      this.log('[DEBUG] 检测到工具调用:', msg.tool_calls.length, '个');

      for (const toolCall of msg.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const toolName = toolCall.function.name;
        const detail = getToolDetail(toolName, args);

        onToolStart?.(toolName, detail);

        let result;
        let shouldSkip = false;
        const handler = getToolHandler(toolName);

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

          if (!shouldSkip) {
            const timeout = args.timeout ?? 60;
            const rawResult = await handler(args.command, timeout);
            result = smartTruncate(args.command, rawResult);
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

          if (!shouldSkip) {
            if (toolName === 'read_file') {
              result = await handler(args.path, args.offset, args.limit);
            } else if (toolName === 'write_file') {
              result = await handler(args.path, args.content);
            } else if (toolName === 'edit_file') {
              result = await handler(args.path, args.operation, args.start, args.end, args.content);
            }
          }
        }

        if (shouldSkip) {
          onToolEnd?.(toolName, 'error', '操作已取消');
        } else {
          onToolEnd?.(toolName, 'done', `工具执行完成: ${toolName}`);
        }

        this.messages.push(msg);
        this.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id
        });
      }

      onThinking?.();
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: this.tools
      });
      msg = response.choices[0].message;
    }

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

    let msg = response.choices[0].message;

    while (msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const toolName = toolCall.function.name;
        const handler = getToolHandler(toolName);
        let result;

        if (toolName === 'bash') {
          const rawResult = await handler(args.command, args.timeout ?? 60);
          result = smartTruncate(args.command, rawResult);
        } else if (toolName === 'read_file') {
          result = await handler(args.path, args.offset, args.limit);
        } else if (toolName === 'write_file') {
          result = await handler(args.path, args.content);
        } else if (toolName === 'edit_file') {
          result = await handler(args.path, args.operation, args.start, args.end, args.content);
        }

        this.messages.push(msg);
        this.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id
        });
      }

      response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: this.tools
      });
      msg = response.choices[0].message;
    }

    this.messages.push(msg);
    return { type: 'response', content: msg.content };
  }

  getMessages() {
    return this.messages;
  }

  setMessages(msgs) {
    this.messages = msgs;
  }
}