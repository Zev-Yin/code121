const DEBUG = process.env.DEBUG === 'true';

const log = (...args) => DEBUG && console.log(...args);

const TOKEN_CONFIG = {
  maxContextTokens: 128000,
  toolOutputBudgetPercent: 0.30,
  get maxToolOutputTokens() {
    return this.maxContextTokens * this.toolOutputBudgetPercent;
  }
};

const HEAD_TAIL_LIMITS = {
  default: { head: 50, tail: 20 },
  ls: { head: 100, tail: 30 },
  cat: { head: 50, tail: 30 },
  npm: { head: 20, tail: 50 },
  yarn: { head: 20, tail: 50 },
  git: { head: 30, tail: 30 },
  find: { head: 30, tail: 50 },
  docker: { head: 20, tail: 40 },
  grep: { head: 200, tail: 50 },
  glob: { head: 100, tail: 0 },
  make: { head: 20, tail: 40 },
  error: { head: 100, tail: 100 },
  tail: { head: 0, tail: 50 },
  head: { head: 50, tail: 0 }
};

const PRIORITY_PATTERNS = [
  /error/i,
  /failed/i,
  /Error/i,
  /FAILED/i,
  /exception/i,
  /Exception/i,
  /traceback/i,
  /StackTrace/i
];

function detectOutputType(output, command) {
  const isError = PRIORITY_PATTERNS.some(pattern => pattern.test(output));
  if (isError) return 'error';

  const cmd = command.trim().split(/\s+/)[0];
  if (cmd === 'tail') return 'tail';
  if (cmd === 'head') return 'head';

  for (const key of Object.keys(HEAD_TAIL_LIMITS)) {
    if (cmd.startsWith(key)) return key;
  }

  return 'default';
}

function getLimits(type) {
  return HEAD_TAIL_LIMITS[type] || HEAD_TAIL_LIMITS.default;
}

function headTailTruncate(output, head, tail) {
  if (!output) return output;

  const lines = output.split('\n');
  if (lines.length <= head + tail) {
    return output;
  }

  const omitted = lines.length - head - tail;

  if (head === 0) {
    return `[... ${omitted} lines omitted ...]\n` + lines.slice(-tail).join('\n');
  }

  if (tail === 0) {
    return lines.slice(0, head).join('\n') + `\n[... ${omitted} lines omitted ...]`;
  }

  return [
    ...lines.slice(0, head),
    `[... ${omitted} lines omitted ...]`,
    ...lines.slice(-tail)
  ].join('\n');
}

function smartTruncate(command, output) {
  const type = detectOutputType(output, command);
  const limits = getLimits(type);

  log(`[TRUNCATE] 检测类型: ${type}, 限制: head=${limits.head}, tail=${limits.tail}`);

  const truncated = headTailTruncate(output, limits.head, limits.tail);

  const originalLines = output.split('\n').length;
  const newLines = truncated.split('\n').length;

  if (originalLines !== newLines) {
    log(`[TRUNCATE] 原始 ${originalLines} 行 → 截断后 ${newLines} 行`);
  }

  return truncated;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function shouldCompress(messages, threshold = 10) {
  let toolOutputCount = 0;
  let totalTokens = 0;

  for (const msg of messages) {
    if (msg.role === 'tool') {
      toolOutputCount++;
      totalTokens += estimateTokens(msg.content);
    }
  }

  return {
    shouldCompress: toolOutputCount > threshold,
    toolOutputCount,
    estimatedTokens: totalTokens,
    budget: TOKEN_CONFIG.maxToolOutputTokens
  };
}

function compressOldOutputs(messages, keepRecent = 3) {
  const compressionInfo = shouldCompress(messages);
  if (!compressionInfo.shouldCompress) {
    log(`[COMPRESS] 无需压缩 (工具输出: ${compressionInfo.toolOutputCount})`);
    return messages;
  }

  log(`[COMPRESS] 开始压缩历史工具输出...`);

  const toolMessages = messages.filter(m => m.role === 'tool');

  if (toolMessages.length <= keepRecent) {
    log(`[COMPRESS] 工具输出数量不足，无需压缩`);
    return messages;
  }

  const toCompress = toolMessages.slice(0, -keepRecent);
  const toCompressIds = new Set(toCompress.map(m => m.tool_call_id));

  let compressedCount = 0;
  const result = messages.map(msg => {
    if (msg.role === 'tool' && toCompressIds.has(msg.tool_call_id)) {
      const summary = summarize(msg.content);
      compressedCount++;
      log(`[COMPRESS] 压缩工具输出 ${compressedCount}/${toCompress.length}`);
      return {
        ...msg,
        content: `[Command output compressed]\n${summary}`,
        _compressed: true
      };
    }
    return msg;
  });

  return result;
}

function summarize(output) {
  if (!output || output.length < 500) return output;

  const lines = output.split('\n');

  if (lines.length <= 15) return output;

  const firstFew = lines.slice(0, 5).join('\n');
  const lastFew = lines.slice(-5).join('\n');
  const omitted = lines.length - 10;

  return `${firstFew}\n[... ${omitted} lines of output summarized ...]\n${lastFew}`;
}

export {
  smartTruncate,
  compressOldOutputs,
  shouldCompress,
  summarize,
  TOKEN_CONFIG,
  HEAD_TAIL_LIMITS,
  detectOutputType
};
