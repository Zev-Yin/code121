/**
 * Inline compact TUI — renders below the command line, no fullscreen takeover.
 * Uses ANSI escape codes + readline; blessed is not required.
 */

import readline from 'readline';
import { parseCommand, loadSkill, listSkills, loadConfig } from './commands.js';
import {
  generateSessionId, saveSession, loadSession,
  listSessions, getLatestSession, deleteSession
} from './session.js';

// ── ANSI color helpers ────────────────────────────────────────────────────────
const A = {
  reset:      '\x1b[0m',
  bold:       '\x1b[1m',
  dim:        '\x1b[2m',
  pink:       '\x1b[38;2;255;105;180m',
  deepPink:   '\x1b[38;2;255;20;147m',
  lightPink:  '\x1b[38;2;255;182;193m',
  dimPink:    '\x1b[38;2;204;119;153m',
  white:      '\x1b[97m',
  green:      '\x1b[38;2;170;255;204m',
  red:        '\x1b[38;2;255;102;102m',
  yellow:     '\x1b[38;2;255;220;100m',
  cyan:       '\x1b[38;2;255;148;208m',
  bgDeepPink: '\x1b[48;2;139;0;70m',
};

const col = (c, s) => `${c}${s}${A.reset}`;
const bold = (s)   => `${A.bold}${s}${A.reset}`;
const dim  = (s)   => `${A.dim}${s}${A.reset}`;

function termWidth() {
  return process.stdout.columns || 80;
}

function hr(char = '─') {
  return col(A.dimPink, char.repeat(termWidth()));
}

function statusLine(model, session) {
  const w = termWidth();
  const left = ` ${col(A.deepPink + A.bold, '✦ Code121')}  ${col(A.pink, model)}`;
  const right = session ? col(A.dimPink, `[${session}] `) : '';
  // Strip ANSI for length calc
  const visibleLeft  = `  Code121  ${model}`;
  const visibleRight = session ? `[${session}] ` : '';
  const pad = w - visibleLeft.length - visibleRight.length;
  return `${A.bgDeepPink}${left}${' '.repeat(Math.max(0, pad))}${right}${A.reset}`;
}

// ── print functions ───────────────────────────────────────────────────────────

function printSep() {
  process.stdout.write(hr() + '\n');
}

function printMsg(role, content) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const w  = termWidth();

  switch (role) {
    case 'user': {
      const header = col(A.lightPink, `你  ${ts}`);
      process.stdout.write(`\n${' '.repeat(Math.max(0, w - 8))}${header}\n`);
      const lines = content.split('\n');
      for (const line of lines) {
        process.stdout.write(col(A.pink, `  ${line}`) + '\n');
      }
      break;
    }
    case 'assistant': {
      const header = bold(col(A.lightPink, `AI  ${ts}`));
      process.stdout.write(`\n${header}\n`);
      const lines = content.split('\n');
      for (const line of lines) {
        process.stdout.write(col(A.white, `  ${line}`) + '\n');
      }
      break;
    }
    case 'thinking':
      process.stdout.write(col(A.dimPink, `  🤔 AI 正在思考...\n`));
      break;
    case 'tool_start':
      process.stdout.write(col(A.cyan, `  ⏳ ${content}\n`));
      break;
    case 'tool_done':
      process.stdout.write(col(A.green, `  ✅ ${content}\n`));
      break;
    case 'tool_error':
      process.stdout.write(col(A.red, `  ❌ ${content}\n`));
      break;
    case 'system':
      process.stdout.write(col(A.dimPink, `  ── ${content} ──\n`));
      break;
    default:
      process.stdout.write(dim(`  ${content}\n`));
  }
}

// ── createTuiUI ───────────────────────────────────────────────────────────────

export function createTuiUI(agent) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let planMode = false;
  let model    = agent.model;
  let session  = null;

  function redrawStatus() {
    process.stdout.write('\n' + statusLine(model, session) + '\n');
  }

  function prompt() {
    redrawStatus();
    return new Promise(resolve => rl.question(col(A.deepPink, '>>> '), resolve));
  }

  const callbacks = {
    onThinking:  ()                 => printMsg('thinking', ''),
    onToolStart: (name, detail)     => printMsg('tool_start', `${name}  ${detail || ''}`),
    onToolEnd:   (name, status)     => printMsg(status === 'error' ? 'tool_error' : 'tool_done',
                                               `${name} ${status === 'error' ? '失败' : '完成'}`),
    onResponse:  (content)          => printMsg('assistant', content),
    onError:     (err)              => printMsg('tool_error', err.message),
  };

  async function handleCommand(input) {
    const result = await parseCommand(input);
    const projectDir = process.cwd();
    if (!result) return null;

    if (result.type === 'exit') {
      printMsg('system', '正在保存会话并退出...');
      const sid = generateSessionId();
      await saveSession(projectDir, sid, agent.getMessages());
      printMsg('system', `会话已保存: ${sid}`);
      rl.close();
      process.exit(0);
    }

    if (result.type === 'help') {
      const skills = await listSkills();
      printSep();
      printMsg('system', '内置命令: /exit /help /clear /debug /model /plan /sessions /resume /save /new');
      if (skills.length) {
        printMsg('system', '技能: ' + skills.map(s => `/${s.name}`).join('  '));
      }
      printMsg('system', 'Ctrl+C 退出');
      printSep();
      return { type: 'handled' };
    }

    if (result.type === 'clear') {
      agent.setMessages([{ role: 'system', content: '你是一个可以调用bash工具的AI' }]);
      printMsg('system', '对话历史已清空');
      return { type: 'handled' };
    }

    if (result.type === 'debug') {
      agent.debug = !agent.debug;
      printMsg('system', `调试模式: ${agent.debug ? '开启' : '关闭'}`);
      return { type: 'handled' };
    }

    if (result.type === 'model') {
      agent.setModel(result.value);
      model = result.value;
      printMsg('system', `模型已切换: ${model}`);
      return { type: 'handled' };
    }

    if (result.type === 'plan') {
      planMode = result.value;
      printMsg('system', planMode ? '已进入规划模式（写操作已锁定）' : '已退出规划模式');
      if (planMode) {
        const skill = await loadSkill('plan');
        if (skill) agent.messages.push({ role: 'user', content: skill.content });
      }
      return { type: 'handled' };
    }

    if (result.type === 'skill') {
      const skill = await loadSkill(result.name);
      if (skill) {
        agent.messages.push({ role: 'user', content: skill.content });
        printMsg('system', `已加载技能: ${result.name}`);
      } else {
        printMsg('tool_error', `未找到技能: ${result.name}`);
      }
      return { type: 'handled' };
    }

    if (result.type === 'error') {
      printMsg('tool_error', result.message);
      return { type: 'handled' };
    }

    if (result.type === 'sessions') {
      const sessions = await listSessions(projectDir);
      if (!sessions.length) {
        printMsg('system', '暂无会话记录');
      } else {
        printMsg('system', '最近会话:\n' +
          sessions.map(s => `    ${s.id}  (${s.messageCount} 条, ${s.savedAt})`).join('\n'));
      }
      return { type: 'handled' };
    }

    if (result.type === 'resume') {
      const messages = await loadSession(projectDir, result.value);
      if (messages) {
        agent.setMessages(messages);
        session = result.value;
        printMsg('system', `已恢复会话: ${result.value}`);
      } else {
        printMsg('tool_error', `未找到会话: ${result.value}`);
      }
      return { type: 'handled' };
    }

    if (result.type === 'save') {
      const sid = generateSessionId();
      const saved = await saveSession(projectDir, sid, agent.getMessages());
      printMsg('system', saved ? `会话已保存: ${sid}` : '保存失败');
      return { type: 'handled' };
    }

    if (result.type === 'new') {
      agent.setMessages([{ role: 'system', content: '你是一个可以调用bash工具的AI' }]);
      session = null;
      printMsg('system', '已开始新会话');
      return { type: 'handled' };
    }

    return null;
  }

  async function start() {
    const config = await loadConfig();
    const projectDir = process.cwd();

    if (config?.systemPrompt) agent.messages[0].content = config.systemPrompt;
    if (config?.model) { agent.setModel(config.model); model = config.model; }

    printSep();
    printMsg('system', 'Code121 启动  /help 查看命令  Ctrl+C 退出');

    const latestSession = await getLatestSession(projectDir);
    if (latestSession) {
      printMsg('system', `发现最近会话: ${latestSession}   使用 /resume ${latestSession} 恢复`);
    }
    printSep();

    while (true) {
      const input = await prompt();
      if (!input.trim()) continue;

      const cmdResult = await handleCommand(input);
      if (cmdResult?.type === 'handled') continue;

      if (planMode) {
        const forbidden =
          ['write_file', 'edit_file', 'bash'].some(t => input.toLowerCase().includes(t)) ||
          [/write_file/i, /edit_file/i, /rm\s+-rf/i, />\s*\//i].some(p => p.test(input));
        if (forbidden) {
          printMsg('system', '⚠️ 规划模式下禁止写操作');
          continue;
        }
      }

      printMsg('user', input);

      const result = await agent.sendMessage(input, callbacks);

      if (result.type === 'exit') {
        const sid = generateSessionId();
        await saveSession(projectDir, sid, agent.getMessages());
        printMsg('system', `会话已保存: ${sid}`);
        rl.close();
        process.exit(0);
      }

      if (result.type === 'confirm') {
        const answer = await new Promise(resolve =>
          rl.question(col(A.yellow, `\n⚠️  ${result.message}\n   ${result.operation}\n   确认执行? (yes/no): `), resolve)
        );
        if (answer.trim().toLowerCase() === 'yes') {
          const cr = await agent.confirmOperation(result.operation, result.message);
          if (cr.type === 'response') printMsg('assistant', cr.content);
        } else {
          printMsg('system', '操作已取消');
        }
      }
    }
  }

  return { start, rl, callbacks };
}
