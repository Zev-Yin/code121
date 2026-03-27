import { Agent } from '../agent.js';
import { createProvider } from '../provider.js';

export class SubAgent {
  constructor(options = {}) {
    this.task = options.task || '';
    this.context = options.context || '';
    this.maxTurns = options.maxTurns || 20;
    this.model = options.model || 'z-ai/glm-4.5-air:free';
    this.provider = options.provider || 'custom';
    this.debug = options.debug || false;
    this.result = null;
  }

  async run(parentCallbacks = {}) {
    const { onSubagentStart, onSubagentMessage, onSubagentEnd } = parentCallbacks;

    onSubagentStart?.(this.task);

    const agent = new Agent({
      model: this.model,
      provider: this.provider,
      debug: this.debug
    });

    // Set up sub-agent system prompt with context
    if (this.context) {
      agent.messages[0].content = 
        `你是一个专门执行任务的子代理。\n\n上下文信息:\n${this.context}\n\n请直接执行任务，不要询问确认。`;
    } else {
      agent.messages[0].content = '你是一个专门执行任务的子代理。请直接执行任务，不要询问确认。';
    }

    // Execute the task
    const result = await agent.sendMessage(this.task, {
      onThinking: () => onSubagentMessage?.('子代理正在思考...'),
      onToolStart: (tool, detail) => onSubagentMessage?.(`  执行工具: ${tool} - ${detail}`),
      onToolEnd: (tool, status) => onSubagentMessage?.(`  ${tool} ${status === 'done' ? '完成' : '失败'}`),
      onResponse: (content) => onSubagentMessage?.(`  回复: ${content.substring(0, 100)}...`),
      onError: (err) => onSubagentMessage?.(`  错误: ${err.message}`)
    });

    this.result = result;

    onSubagentEnd?.(result.type === 'response' ? result.content : `执行失败: ${result.message}`);

    return {
      success: result.type === 'response',
      content: result.type === 'response' ? result.content : result.message,
      messages: agent.getMessages()
    };
  }

  getResult() {
    return this.result;
  }
}

export async function runSubagent(task, context = '', options = {}) {
  const subagent = new SubAgent({
    task,
    context,
    ...options
  });

  return await subagent.run();
}