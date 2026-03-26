import OpenAI, { APIError, AuthenticationError, APIConnectionError, RateLimitError, NotFoundError } from "openai";
import { exec } from "child_process";
import { readFile, writeFile } from "fs/promises";
import readline from "readline";
import { smartTruncate, compressOldOutputs, shouldCompress } from './truncate.js';
import { checkDangerous, checkFilePath } from './security.js';

const DEBUG = process.env.DEBUG === 'true';
const log = (...args) => DEBUG && console.log(...args);

const MODEL = process.env.OPENAI_MODEL_NAME || 'z-ai/glm-4.5-air:free';

const client = new OpenAI();

function handleAPIError(error) {
  if (error instanceof AuthenticationError) {
    return {
      message: 'API 认证失败，请检查 OPENAI_API_KEY 环境变量是否正确设置',
      recoverable: false
    };
  }
  
  if (error instanceof APIConnectionError) {
    return {
      message: '网络连接失败，请检查网络或代理设置',
      recoverable: true
    };
  }
  
  if (error instanceof RateLimitError) {
    return {
      message: 'API 调用频率超限，请稍后重试',
      recoverable: true
    };
  }
  
  if (error instanceof NotFoundError) {
    return {
      message: `模型不存在: ${MODEL}，请检查 OPENAI_MODEL_NAME 环境变量`,
      recoverable: false
    };
  }
  
  if (error instanceof APIError) {
    const status = error.status;
    if (status >= 500) {
      return {
        message: 'API 服务器错误，请稍后重试',
        recoverable: true
      };
    }
    if (status === 429) {
      return {
        message: 'API 请求过多，请稍后重试',
        recoverable: true
      };
    }
    return {
      message: `API 请求失败 (${status}): ${error.message}`,
      recoverable: status >= 400 && status < 500 && status !== 429 ? false : true
    };
  }
  
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return {
      message: '请求超时，请检查网络状况后重试',
      recoverable: true
    };
  }
  
  return {
    message: `发生错误: ${error.message || error}`,
    recoverable: true
  };
}

function printStatus(status, message) {
  const icons = {
    thinking: '🤔',
    running: '⏳',
    done: '✅',
    error: '❌',
    confirm: '⚠️'
  };
  console.log(`[${icons[status] || '⏸️'}] ${message}`);
}

function confirmDangerous(operation, msg) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`\n⚠️ 危险操作: ${msg}\n   ${operation}\n   是否确认执行? (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

function runBash(command) {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      resolve(stdout + stderr);
    });
  });
}

async function runReadFile(path, offset, limit) {
  try {
    const content = await readFile(path, 'utf-8');
    const lines = content.split('\n');

    let start = offset || 0;
    let end = limit ? start + limit : lines.length;

    if (start >= lines.length) {
      return `文件共有 ${lines.length} 行，起始位置超出范围`;
    }

    end = Math.min(end, lines.length);
    const selectedLines = lines.slice(start, end);

    let result = selectedLines.join('\n');

    if (lines.length > 200) {
      const truncated = smartTruncate(`cat ${path}`, result);
      return `${truncated}\n\n[文件共 ${lines.length} 行，当前显示第 ${start + 1}-${end} 行]`;
    }

    if (start > 0 || end < lines.length) {
      return result + `\n\n[文件共 ${lines.length} 行，当前显示第 ${start + 1}-${end} 行]`;
    }

    return result;
  } catch (error) {
    return `读取文件失败: ${error.message}`;
  }
}

async function runWriteFile(path, content) {
  try {
    await writeFile(path, content, 'utf-8');
    const lines = content.split('\n').length;
    return `文件写入成功: ${path} (${lines} 行)`;
  } catch (error) {
    return `写入文件失败: ${error.message}`;
  }
}

async function runEditFile(path, operation, start, end, content) {
  try {
    const fileContent = await readFile(path, 'utf-8');
    const lines = fileContent.split('\n');

    const startLine = Math.max(0, start - 1);
    const endLine = end ? Math.min(end, lines.length) : lines.length;

    let newLines;
    if (operation === "replace") {
      newLines = [
        ...lines.slice(0, startLine),
        ...content.split('\n'),
        ...lines.slice(endLine)
      ];
    } else if (operation === "insert") {
      newLines = [
        ...lines.slice(0, startLine),
        ...content.split('\n'),
        ...lines.slice(startLine)
      ];
    } else if (operation === "delete") {
      newLines = [
        ...lines.slice(0, startLine),
        ...lines.slice(endLine)
      ];
    } else {
      return `不支持的操作: ${operation}`;
    }

    const newContent = newLines.join('\n');
    await writeFile(path, newContent, 'utf-8');

    const deletedCount = endLine - startLine;
    const insertedCount = content.split('\n').length;

    if (operation === "replace") {
      return `已替换第 ${start}-${end} 行 (删除了 ${deletedCount} 行，插入了 ${insertedCount} 行)`;
    } else if (operation === "insert") {
      return `已在第 ${start} 行后插入 ${insertedCount} 行`;
    } else if (operation === "delete") {
      return `已删除第 ${start}-${end} 行 (共 ${deletedCount} 行)`;
    }

    return "编辑成功";
  } catch (error) {
    return `编辑文件失败: ${error.message}`;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages = [
  { role: "system", content: "你是一个可以调用bash工具的AI" },
];

const tools = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "执行系统命令",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取文件内容，支持按行范围读取",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          offset: { type: "number", description: "起始行号(可选，默认0)" },
          limit: { type: "number", description: "读取行数(可选，默认全部)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "写入或创建文件(覆盖整个文件)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          content: { type: "string", description: "文件内容" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "编辑文件指定行或范围的内容",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径" },
          operation: {
            type: "string",
            enum: ["replace", "insert", "delete"],
            description: "操作类型: replace替换/insert插入/delete删除"
          },
          start: { type: "number", description: "起始行号(1-based)" },
          end: { type: "number", description: "结束行号(仅replace/delete可选)" },
          content: { type: "string", description: "替换/插入的内容(仅replace/insert需要)" }
        },
        required: ["path", "operation", "start"]
      }
    }
  }
];

console.log('Code121 启动成功，输入消息开始对话 (exit 退出)\n');

function ask() {
  rl.question('>>> ', async (input) => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === 'exit' || trimmed === 'exit()') {
      console.log('再见!');
      rl.close();
      process.exit(0);
    }

    const userDanger = checkDangerous(input);
    if (userDanger.dangerous) {
      if (userDanger.level === 'critical') {
        console.log(`\n⛔ 已拦截危险操作: ${userDanger.msg}`);
        console.log('此操作被禁止执行。\n');
        ask();
        return;
      } else {
        const confirmed = await confirmDangerous(input, userDanger.msg);
        if (!confirmed) {
          console.log('操作已取消。\n');
          ask();
          return;
        }
      }
    }

    log('[DEBUG] 用户输入:', input);
    messages.push({ role: 'user', content: input });

    printStatus('thinking', 'AI 正在思考...');

    let response;
    try {
      response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools
      });
    } catch (error) {
      const err = handleAPIError(error);
      printStatus('error', err.message);
      if (!err.recoverable) {
        console.log('\n请修复上述问题后重新运行程序。');
        rl.close();
        process.exit(1);
      }
      console.log('请重试或输入 exit 退出。\n');
      ask();
      return;
    }
    log('[DEBUG] 原始响应:', JSON.stringify(response, null, 2));

    let msg = response.choices[0].message;

    while (msg.tool_calls) {
      log('[DEBUG] 检测到工具调用');

      const toolCall = msg.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);
      const toolName = toolCall.function.name;

      printStatus('running', `执行工具: ${toolName}`);

      let result;
      let shouldSkip = false;

      if (toolName === 'bash') {
        const cmdDanger = checkDangerous(args.command);
        if (cmdDanger.dangerous) {
          if (cmdDanger.level === 'critical') {
            result = `⛔ 已拦截危险操作: ${cmdDanger.msg}\n此操作被禁止执行。`;
            shouldSkip = true;
          } else {
            const confirmed = await confirmDangerous(args.command, cmdDanger.msg);
            if (!confirmed) {
              result = '操作已取消。';
              shouldSkip = true;
            }
          }
        }

        if (!shouldSkip) {
          log('[DEBUG] 执行命令:', args.command);
          const rawResult = await runBash(args.command);
          log('[DEBUG] 原始命令结果长度:', rawResult.length, '字符');
          result = smartTruncate(args.command, rawResult);
          log('[DEBUG] 截断后长度:', result.length, '字符');
        }
      } else if (toolName === 'read_file') {
        const pathDanger = checkFilePath(args.path, 'read');
        if (pathDanger.dangerous) {
          const confirmed = await confirmDangerous(`读取 ${args.path}`, pathDanger.msg);
          if (!confirmed) {
            result = '操作已取消。';
            shouldSkip = true;
          }
        }

        if (!shouldSkip) {
          log('[DEBUG] 读取文件:', args.path);
          result = await runReadFile(args.path, args.offset, args.limit);
          log('[DEBUG] 文件内容长度:', result.length, '字符');
        }
      } else if (toolName === 'write_file') {
        const pathDanger = checkFilePath(args.path, 'write');
        if (pathDanger.dangerous) {
          if (pathDanger.level === 'critical') {
            result = `⛔ 已拦截危险操作: ${pathDanger.msg}\n此操作被禁止执行。`;
            shouldSkip = true;
          } else {
            const confirmed = await confirmDangerous(`写入 ${args.path}`, pathDanger.msg);
            if (!confirmed) {
              result = '操作已取消。';
              shouldSkip = true;
            }
          }
        }

        if (!shouldSkip) {
          log('[DEBUG] 写入文件:', args.path);
          result = await runWriteFile(args.path, args.content);
          log('[DEBUG] 写入结果:', result);
        }
      } else if (toolName === 'edit_file') {
        const pathDanger = checkFilePath(args.path, args.operation);
        if (pathDanger.dangerous) {
          if (pathDanger.level === 'critical') {
            result = `⛔ 已拦截危险操作: ${pathDanger.msg}\n此操作被禁止执行。`;
            shouldSkip = true;
          } else {
            const confirmed = await confirmDangerous(`编辑 ${args.path}`, pathDanger.msg);
            if (!confirmed) {
              result = '操作已取消。';
              shouldSkip = true;
            }
          }
        }

        if (!shouldSkip) {
          log('[DEBUG] 编辑文件:', args.path, args.operation);
          result = await runEditFile(args.path, args.operation, args.start, args.end, args.content);
          log('[DEBUG] 编辑结果:', result);
        }
      }

      if (shouldSkip) {
        printStatus('error', '操作已取消');
      } else {
        printStatus('done', `工具执行完成: ${toolName}`);
      }

      messages.push(msg);
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id
      });

      printStatus('thinking', 'AI 正在思考...');
      let toolResponse;
      try {
        toolResponse = await client.chat.completions.create({
          model: MODEL,
          messages,
          tools
        });
      } catch (error) {
        const err = handleAPIError(error);
        printStatus('error', err.message);
        if (!err.recoverable) {
          console.log('\n请修复上述问题后重新运行程序。');
          rl.close();
          process.exit(1);
        }
        console.log('工具已执行完成，可继续输入其他命令。\n');
        ask();
        return;
      }
      msg = toolResponse.choices[0].message;
      log('[DEBUG] AI 后续响应:', msg);
    }

    log('[DEBUG] 最终回复:', msg.content);
    console.log(msg.content);
    messages.push(msg);

    const finalCompressionInfo = shouldCompress(messages);
    if (finalCompressionInfo.shouldCompress) {
      log('[DEBUG] 对话结束，触发语义压缩...');
      const compressedMessages = compressOldOutputs(messages, 3);
      messages.length = 0;
      messages.push(...compressedMessages);
      log(`[DEBUG] 压缩后消息数: ${messages.length}`);
    }

    ask();
  });
}

ask();