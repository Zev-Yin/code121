import readline from "readline";
import { parseCommand, loadSkill, listSkills, loadConfig } from './commands.js';
import { 
  generateSessionId, 
  saveSession, 
  loadSession, 
  listSessions, 
  getLatestSession,
  deleteSession 
} from './session.js';

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

export function createReadlineUI(agent) {
  const rl = createReadlineInterface();
  let planMode = false;
  let debugMode = process.env.DEBUG === 'true';

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

  async function handleCommand(input) {
    const result = await parseCommand(input);
    const projectDir = process.cwd();
    
    if (!result) return null;
    
    if (result.type === 'exit') {
      console.log('再见!');
      rl.close();
      process.exit(0);
    }
    
    if (result.type === 'help') {
      const skills = await listSkills();
      console.log('\n=== 可用命令 ===');
      
      console.log('\n内置命令:');
      console.log('  /exit    - 退出程序');
      console.log('  /help    - 显示帮助');
      console.log('  /clear   - 清空对话历史');
      console.log('  /debug   - 切换调试模式 (当前: ' + (debugMode ? '开启' : '关闭') + ')');
      console.log('  /model   - 切换模型');
      console.log('  /plan    - 进入规划模式');
      console.log('  /apply   - 应用计划');
      console.log('  /sessions - 列出最近会话');
      console.log('  /resume  - 恢复指定会话');
      console.log('  /save    - 保存当前会话');
      console.log('  /new     - 开始新会话');
      
      if (skills.length > 0) {
        console.log('\n技能命令:');
        for (const skill of skills) {
          console.log(`  /${skill.name}  - ${skill.description}`);
        }
      }
      
      console.log('');
      return { type: 'handled' };
    }
    
    if (result.type === 'clear') {
      agent.setMessages([
        { role: "system", content: "你是一个可以调用bash工具的AI" }
      ]);
      console.log('对话历史已清空。\n');
      return { type: 'handled' };
    }
    
    if (result.type === 'debug') {
      debugMode = !debugMode;
      console.log(`调试模式已${debugMode ? '开启' : '关闭'}。\n`);
      agent.debug = debugMode;
      return { type: 'handled' };
    }
    
    if (result.type === 'model') {
      agent.setModel(result.value);
      console.log(`模型已切换为: ${result.value} (Provider: ${agent.getProvider()})\n`);
      return { type: 'handled' };
    }
    
    if (result.type === 'plan') {
      planMode = result.value;
      if (planMode) {
        const skill = await loadSkill('plan');
        if (skill) {
          agent.messages.push({
            role: 'user',
            content: skill.content
          });
          console.log('已进入规划模式。使用 /apply 来应用计划。\n');
        }
      } else {
        console.log('已退出规划模式。\n');
      }
      return { type: 'handled' };
    }
    
    if (result.type === 'skill') {
      const skill = await loadSkill(result.name);
      if (skill) {
        agent.messages.push({
          role: 'user',
          content: skill.content
        });
        console.log(`已加载技能: ${result.name}\n`);
        return { type: 'handled' };
      } else {
        console.log(`未找到技能: ${result.name}\n`);
        return { type: 'handled' };
      }
    }
    
    if (result.type === 'error') {
      console.log(result.message + '\n');
      return { type: 'handled' };
    }
    
    // Session commands
    
    if (result.type === 'sessions') {
      const sessions = await listSessions(projectDir);
      if (sessions.length === 0) {
        console.log('暂无会话记录。\n');
      } else {
        console.log('\n=== 最近会话 ===');
        for (const s of sessions) {
          console.log(`  ${s.id}  (${s.messageCount} 条消息, ${s.savedAt})`);
        }
        console.log('');
      }
      return { type: 'handled' };
    }
    
    if (result.type === 'resume') {
      const messages = await loadSession(projectDir, result.value);
      if (messages) {
        agent.setMessages(messages);
        console.log(`已恢复会话: ${result.value}\n`);
      } else {
        console.log(`未找到会话: ${result.value}\n`);
      }
      return { type: 'handled' };
    }
    
    if (result.type === 'save') {
      const sessionId = generateSessionId();
      const saved = await saveSession(projectDir, sessionId, agent.getMessages());
      if (saved) {
        console.log(`会话已保存: ${sessionId}\n`);
      } else {
        console.log('保存会话失败。\n');
      }
      return { type: 'handled' };
    }
    
    if (result.type === 'new') {
      agent.setMessages([
        { role: "system", content: "你是一个可以调用bash工具的AI" }
      ]);
      console.log('已创建新会话。\n');
      return { type: 'handled' };
    }
    
    return null;
  }

  async function start() {
    const config = await loadConfig();
    const projectDir = process.cwd();
    
    if (config) {
      if (config.systemPrompt) {
        agent.messages[0].content = config.systemPrompt;
      }
      if (config.model) {
        agent.model = config.model;
      }
      console.log(`已加载项目配置，模型: ${agent.model}\n`);
    }
    
    // Check for latest session to restore
    const latestSession = await getLatestSession(projectDir);
    if (latestSession) {
      console.log(`发现最近会话: ${latestSession}`);
      console.log('使用 /resume ' + latestSession + ' 恢复，或 /new 开始新会话\n');
    }
    
    console.log('Code121 启动成功，输入消息开始对话 (exit 退出)\n');

    async function loop() {
      while (true) {
        const input = await askQuestion(rl, '>>> ');

        const cmdResult = await handleCommand(input);
        if (cmdResult && cmdResult.type === 'handled') {
          continue;
        }

        if (planMode) {
          const writeTools = ['write_file', 'edit_file', 'bash'];
          const forbiddenPatterns = [
            /write_file/i,
            /edit_file/i,
            /rm\s+-rf/i,
            /del\s+/i,
            />\s*\//i
          ];

          const isForbidden = writeTools.some(t => input.toLowerCase().includes(t)) ||
            forbiddenPatterns.some(p => p.test(input));

          if (isForbidden) {
            console.log('⚠️ 规划模式下禁止执行写操作。计划已被记录。\n');
            continue;
          }
        }

        const result = await agent.sendMessage(input, callbacks);

        if (result.type === 'exit') {
          // Auto-save session on exit
          const projectDir = process.cwd();
          const sessionId = generateSessionId();
          await saveSession(projectDir, sessionId, agent.getMessages());
          console.log(`会话已自动保存: ${sessionId}`);
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
      }
    }

    loop();
  }

  return { start, rl, callbacks, setPlanMode: (v) => planMode = v };
}

// ── TUI mode factory (lazy import so blessed isn't required in readline mode) ─
export async function createUI(agent) {
  if (process.env.TUI_MODE === 'true' || process.argv.includes('--tui')) {
    const { createTuiUI } = await import('./tui.js');
    return createTuiUI(agent);
  }
  return createReadlineUI(agent);
}