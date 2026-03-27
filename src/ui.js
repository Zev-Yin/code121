import readline from "readline";

export function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

export function printStatus(status, message, detail = '') {
  const icons = {
    thinking: '🤔',
    running: '⏳',
    done: '✅',
    error: '❌',
    confirm: '⚠️'
  };
  let output = `[${icons[status] || '⏸️'}] ${message}`;
  if (detail) {
    const truncated = detail.length > 60 ? detail.substring(0, 60) + '...' : detail;
    output += `\n    ${truncated}`;
  }
  console.log(output);
}

export async function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

export async function confirmDangerous(operation, msg, rl) {
  const answer = await askQuestion(
    rl,
    `\n⚠️ 危险操作: ${msg}\n   ${operation}\n   是否确认执行? (yes/no): `
  );
  return answer.trim().toLowerCase() === 'yes';
}

export function createUI(agent) {
  const rl = createReadlineInterface();

  const callbacks = {
    onThinking: () => printStatus('thinking', 'AI 正在思考...'),
    onToolStart: (toolName, detail) => printStatus('running', `执行工具: ${toolName}`, detail),
    onToolEnd: (toolName, status, message) => {
      if (status === 'error') {
        printStatus('error', '操作已取消');
      } else {
        printStatus('done', message);
      }
    },
    onResponse: (content) => console.log(content),
    onError: (error) => printStatus('error', error.message)
  };

  async function start() {
    console.log('Code121 启动成功，输入消息开始对话 (exit 退出)\n');

    async function loop() {
      const input = await askQuestion(rl, '>>> ');
      
      const trimmed = input.trim().toLowerCase();
      if (trimmed === 'exit' || trimmed === 'exit()') {
        console.log('再见!');
        rl.close();
        process.exit(0);
      }

      const result = await agent.sendMessage(input, callbacks);

      if (result.type === 'exit') {
        console.log('再见!');
        rl.close();
        process.exit(0);
      }

      if (result.type === 'confirm') {
        const confirmed = await confirmDangerous(result.operation, result.message, rl);
        if (confirmed) {
          const confirmResult = await agent.confirmOperation(result.operation, result.message);
          if (confirmResult.type === 'response') {
            console.log(confirmResult.content);
          }
        } else {
          console.log('操作已取消。\n');
        }
      }

      loop();
    }

    loop();
  }

  return { start, rl, callbacks };
}