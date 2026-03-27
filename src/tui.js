import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const blessed = require('blessed');

// ── Pink color palette ───────────────────────────────────────────────────────
const C = {
  pink:         '#ff69b4',
  lightPink:    '#ffb6c1',
  deepPink:     '#ff1493',
  roseBg:       '#2d0018',
  darkBg:       '#160010',
  dimText:      '#cc7799',
  white:        '#ffffff',
  userBubble:   '#ff85c2',
  aiBubble:     '#ffe0f0',
  toolColor:    '#ff94d0',
  errorColor:   '#ff6666',
  successColor: '#aaffcc',
};

// ── TUI class ────────────────────────────────────────────────────────────────
export class TUI {
  constructor() {
    this.screen      = null;
    this.chatBox     = null;
    this.fileViewer  = null;
    this.statusBar   = null;
    this.inputBox    = null;
    this._inputHistory  = [];
    this._historyIndex  = -1;
    this._inputBuffer   = '';
    this._onInputCb     = null;
    this._planMode      = false;
    this._statusModel   = 'code121';
    this._statusSession = null;
  }

  init() {
    this.screen = blessed.screen({
      smartCSR:     true,
      title:        'Code121',
      fullUnicode:  true,
      forceUnicode: true,
    });

    this._buildLayout();
    this._bindKeys();
    this.screen.render();
  }

  _buildLayout() {
    const s = this.screen;

    // ── Chat panel (left 65%) ─────────────────────────────────────────────
    this.chatBox = blessed.box({
      parent: s,
      top: 0, left: 0,
      width: '65%', height: '100%-4',
      label: ` {bold}{${C.deepPink}-fg}✦ 对话{/${C.deepPink}-fg}{/bold} `,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: C.pink },
        label:  { fg: C.pink },
        bg:     C.darkBg,
        fg:     C.white,
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '▐',
        style: { bg: C.deepPink },
        track: { bg: C.roseBg },
      },
      mouse: true, keys: true,
      wrap: true,
      padding: { left: 1, right: 1 },
    });

    // ── File viewer (right 35%) ───────────────────────────────────────────
    this.fileViewer = blessed.box({
      parent: s,
      top: 0, left: '65%',
      width: '35%', height: '100%-4',
      label: ` {bold}{${C.lightPink}-fg}📄 文件预览{/${C.lightPink}-fg}{/bold} `,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: C.pink },
        label:  { fg: C.lightPink },
        bg:     C.darkBg,
        fg:     C.dimText,
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '▐',
        style: { bg: C.pink },
        track: { bg: C.roseBg },
      },
      mouse: true, keys: true,
      wrap: true,
      padding: { left: 1, right: 0 },
      content: `{${C.dimText}-fg}等待 read_file 调用...{/${C.dimText}-fg}`,
    });

    // ── Status bar ────────────────────────────────────────────────────────
    this.statusBar = blessed.box({
      parent: s,
      bottom: 3, left: 0,
      width: '100%', height: 1,
      tags: true,
      style: { bg: C.deepPink, fg: C.white, bold: true },
      padding: { left: 1 },
      content: ' {bold}✦ Code121{/bold} ',
    });

    // ── Input box ─────────────────────────────────────────────────────────
    this.inputBox = blessed.textbox({
      parent: s,
      bottom: 0, left: 0,
      width: '100%', height: 3,
      label: ` {bold}{${C.pink}-fg}▶ 输入{/${C.pink}-fg}{/bold} `,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: C.pink },
        label:  { fg: C.pink },
        bg:     C.roseBg,
        fg:     C.white,
        focus:  { border: { fg: C.deepPink }, bg: C.roseBg },
      },
      inputOnFocus: true,
      mouse: true, keys: true,
    });

    this.inputBox.focus();
  }

  _bindKeys() {
    const s = this.screen;

    s.key(['C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    s.key(['pageup'], () => {
      this.chatBox.scroll(-(this.chatBox.height - 2));
      s.render();
    });
    s.key(['pagedown'], () => {
      this.chatBox.scroll(this.chatBox.height - 2);
      s.render();
    });

    s.key(['tab'], () => {
      if (s.focused === this.inputBox) {
        this.chatBox.focus();
      } else if (s.focused === this.chatBox) {
        this.fileViewer.focus();
      } else {
        this.inputBox.focus();
      }
      s.render();
    });

    s.key(['up'], () => {
      if (s.focused !== this.inputBox) return;
      if (!this._inputHistory.length) return;
      if (this._historyIndex === -1) {
        this._inputBuffer = this.inputBox.getValue();
        this._historyIndex = this._inputHistory.length - 1;
      } else if (this._historyIndex > 0) {
        this._historyIndex--;
      }
      this.inputBox.setValue(this._inputHistory[this._historyIndex]);
      s.render();
    });

    s.key(['down'], () => {
      if (s.focused !== this.inputBox || this._historyIndex === -1) return;
      if (this._historyIndex < this._inputHistory.length - 1) {
        this._historyIndex++;
        this.inputBox.setValue(this._inputHistory[this._historyIndex]);
      } else {
        this._historyIndex = -1;
        this.inputBox.setValue(this._inputBuffer);
      }
      s.render();
    });

    this.inputBox.key(['enter'], () => {
      const value = this.inputBox.getValue().trim();
      if (!value) return;
      this._inputHistory.push(value);
      this._historyIndex = -1;
      this._inputBuffer = '';
      this.inputBox.clearValue();
      s.render();
      this._onInputCb?.(value);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  onInput(cb) { this._onInputCb = cb; }

  appendMessage(role, content) {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const txt = this._esc(content);
    let line;

    switch (role) {
      case 'user':
        line = `{right}{bold}{${C.userBubble}-fg}你  ${ts}{/${C.userBubble}-fg}{/bold}{/right}\n`
             + `{right}{${C.lightPink}-fg}${txt}{/${C.lightPink}-fg}{/right}`;
        break;
      case 'assistant':
        line = `{bold}{${C.aiBubble}-fg}AI  ${ts}{/${C.aiBubble}-fg}{/bold}\n`
             + `{${C.white}-fg}${txt}{/${C.white}-fg}`;
        break;
      case 'thinking':
        line = `{${C.dimText}-fg}🤔 AI 正在思考...{/${C.dimText}-fg}`;
        break;
      case 'tool_start':
        line = `{${C.toolColor}-fg}⏳ ${txt}{/${C.toolColor}-fg}`;
        break;
      case 'tool_done':
        line = `{${C.successColor}-fg}✅ ${txt}{/${C.successColor}-fg}`;
        break;
      case 'tool_error':
        line = `{${C.errorColor}-fg}❌ ${txt}{/${C.errorColor}-fg}`;
        break;
      case 'system':
        line = `{${C.dimText}-fg}── ${txt} ──{/${C.dimText}-fg}`;
        break;
      default:
        line = `{${C.dimText}-fg}${txt}{/${C.dimText}-fg}`;
    }

    this.chatBox.pushLine(line);
    this.chatBox.pushLine('');
    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  setStatus(text) {
    const model   = this._statusModel || 'code121';
    const session = this._statusSession ? `  [${this._esc(this._statusSession)}]` : '';
    const extra   = text ? `  {bold}${this._esc(text)}{/bold}` : '';
    this.statusBar.setContent(` {bold}✦ Code121{/bold}  ${this._esc(model)}${session}${extra} `);
    this.screen.render();
  }

  setStatusMeta(model, sessionId) {
    this._statusModel   = model;
    this._statusSession = sessionId;
    this.setStatus('');
  }

  setFileContent(filePath, content) {
    this.fileViewer.setLabel(
      ` {bold}{${C.lightPink}-fg}📄 ${this._esc(filePath)}{/${C.lightPink}-fg}{/bold} `
    );
    this.fileViewer.setContent(`{${C.white}-fg}${this._esc(content)}{/${C.white}-fg}`);
    this.fileViewer.setScrollPerc(0);
    this.screen.render();
  }

  showConfirm(operation, msg, cb) {
    const dialog = blessed.question({
      parent: this.screen,
      top: 'center', left: 'center',
      width: '60%', height: 8,
      label: ` {bold}{${C.deepPink}-fg}⚠️  危险操作确认{/${C.deepPink}-fg}{/bold} `,
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: C.deepPink }, bg: C.roseBg, fg: C.white },
    });
    dialog.ask(
      `{${C.errorColor}-fg}${this._esc(msg)}{/${C.errorColor}-fg}\n`
      + `{${C.dimText}-fg}${this._esc(operation)}{/${C.dimText}-fg}\n\n确认执行? (y/n)`,
      (_err, value) => cb(value === true || value === 'y' || value === 'yes')
    );
  }

  focusInput() {
    this.inputBox.focus();
    this.screen.render();
  }

  destroy() {
    try { this.screen.destroy(); } catch (_) {}
  }

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  }
}

// ── createTuiUI ──────────────────────────────────────────────────────────────
// Same surface as createUI() in ui.js – returns { start }

export function createTuiUI(agent) {
  const tui = new TUI();
  tui.init();

  const callbacks = {
    onThinking: () => tui.appendMessage('thinking', ''),
    onToolStart: (toolName, detail) => {
      tui.appendMessage('tool_start', `执行工具: ${toolName}  ${detail || ''}`);
      tui.setStatus(`⏳ ${toolName} 运行中...`);
    },
    onToolEnd: (toolName, status) => {
      if (status === 'error') {
        tui.appendMessage('tool_error', `${toolName} 已取消`);
      } else {
        tui.appendMessage('tool_done', `${toolName} 完成`);
      }
      tui.setStatus('');
    },
    onResponse: (content) => {
      tui.appendMessage('assistant', content);
      tui.setStatus('');
    },
    onError: (error) => {
      tui.appendMessage('tool_error', error.message);
      tui.setStatus('');
    },
  };

  async function handleCommand(input) {
    const { parseCommand, loadSkill, listSkills } = await import('./commands.js');
    const result = await parseCommand(input);
    if (!result) return null;

    if (result.type === 'exit') {
      tui.appendMessage('system', '正在保存会话并退出...');
      const { generateSessionId, saveSession } = await import('./session.js');
      const sessionId = generateSessionId();
      await saveSession(process.cwd(), sessionId, agent.getMessages());
      setTimeout(() => { tui.destroy(); process.exit(0); }, 400);
      return { type: 'handled' };
    }

    if (result.type === 'help') {
      const skills = await listSkills();
      const skillLine = skills.length
        ? '技能: ' + skills.map(s => `/${s.name}`).join('  ')
        : '(无自定义技能)';
      tui.appendMessage('system',
        '内置命令: /exit /help /clear /debug /model /plan /apply /sessions /resume /save /new\n'
        + skillLine + '\n'
        + 'Tab 切换焦点  PageUp/Down 滚动对话  Ctrl+C 退出'
      );
      return { type: 'handled' };
    }

    if (result.type === 'clear') {
      agent.setMessages([{ role: 'system', content: '你是一个可以调用bash工具的AI' }]);
      tui.appendMessage('system', '对话历史已清空');
      return { type: 'handled' };
    }

    if (result.type === 'debug') {
      agent.debug = !agent.debug;
      tui.appendMessage('system', `调试模式: ${agent.debug ? '开启' : '关闭'}`);
      return { type: 'handled' };
    }

    if (result.type === 'model') {
      agent.setModel(result.value);
      tui.setStatusMeta(result.value, null);
      tui.appendMessage('system', `模型已切换: ${result.value}`);
      return { type: 'handled' };
    }

    if (result.type === 'plan') {
      tui._planMode = result.value;
      tui.appendMessage('system', result.value ? '已进入规划模式（写操作已锁定）' : '已退出规划模式');
      if (result.value) {
        const skill = await loadSkill('plan');
        if (skill) agent.messages.push({ role: 'user', content: skill.content });
      }
      return { type: 'handled' };
    }

    if (result.type === 'skill') {
      const skill = await loadSkill(result.name);
      if (skill) {
        agent.messages.push({ role: 'user', content: skill.content });
        tui.appendMessage('system', `已加载技能: ${result.name}`);
      } else {
        tui.appendMessage('tool_error', `未找到技能: ${result.name}`);
      }
      return { type: 'handled' };
    }

    if (result.type === 'error') {
      tui.appendMessage('tool_error', result.message);
      return { type: 'handled' };
    }

    if (result.type === 'sessions') {
      const { listSessions } = await import('./session.js');
      const sessions = await listSessions(process.cwd());
      if (!sessions.length) {
        tui.appendMessage('system', '暂无会话记录');
      } else {
        tui.appendMessage('system',
          '最近会话:\n' + sessions.map(s => `${s.id}  (${s.messageCount} 条, ${s.savedAt})`).join('\n')
        );
      }
      return { type: 'handled' };
    }

    if (result.type === 'resume') {
      const { loadSession } = await import('./session.js');
      const messages = await loadSession(process.cwd(), result.value);
      if (messages) {
        agent.setMessages(messages);
        tui.setStatusMeta(agent.model, result.value);
        tui.appendMessage('system', `已恢复会话: ${result.value}`);
        _updateFileViewer(messages);
      } else {
        tui.appendMessage('tool_error', `未找到会话: ${result.value}`);
      }
      return { type: 'handled' };
    }

    if (result.type === 'save') {
      const { generateSessionId, saveSession } = await import('./session.js');
      const sessionId = generateSessionId();
      const saved = await saveSession(process.cwd(), sessionId, agent.getMessages());
      tui.appendMessage('system', saved ? `会话已保存: ${sessionId}` : '保存失败');
      return { type: 'handled' };
    }

    if (result.type === 'new') {
      agent.setMessages([{ role: 'system', content: '你是一个可以调用bash工具的AI' }]);
      tui.appendMessage('system', '已开始新会话');
      return { type: 'handled' };
    }

    return null;
  }

  function _updateFileViewer(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'tool' || !msg.content || msg._compressed) continue;
      for (let j = i - 1; j >= 0; j--) {
        const aMsg = messages[j];
        if (aMsg.role === 'assistant' && aMsg.tool_calls) {
          const tc = aMsg.tool_calls.find(t => t.id === msg.tool_call_id);
          if (tc && tc.function.name === 'read_file') {
            const args = JSON.parse(tc.function.arguments);
            tui.setFileContent(args.path, msg.content);
            return;
          }
        }
      }
    }
  }

  async function start() {
    const { loadConfig } = await import('./commands.js');
    const { generateSessionId, saveSession, getLatestSession } = await import('./session.js');
    const projectDir = process.cwd();

    const config = await loadConfig();
    if (config?.systemPrompt) agent.messages[0].content = config.systemPrompt;
    if (config?.model) agent.setModel(config.model);

    tui.setStatusMeta(agent.model, null);
    tui.appendMessage('system', 'Code121 已启动  /help 查看命令  Tab 切换焦点  Ctrl+C 退出');

    const latestSession = await getLatestSession(projectDir);
    if (latestSession) {
      tui.appendMessage('system', `发现最近会话: ${latestSession}   使用 /resume ${latestSession} 恢复`);
    }

    tui.focusInput();

    tui.onInput(async (input) => {
      tui.appendMessage('user', input);

      const cmdResult = await handleCommand(input);
      if (cmdResult?.type === 'handled') {
        tui.focusInput();
        return;
      }

      // Plan mode guard
      if (tui._planMode) {
        const forbidden =
          ['write_file', 'edit_file', 'bash'].some(t => input.toLowerCase().includes(t)) ||
          [/write_file/i, /edit_file/i, /rm\s+-rf/i, />\s*\//i].some(p => p.test(input));
        if (forbidden) {
          tui.appendMessage('system', '⚠️ 规划模式下禁止写操作');
          tui.focusInput();
          return;
        }
      }

      tui.setStatus('🤔 思考中...');
      const result = await agent.sendMessage(input, callbacks);

      if (result.type === 'error') {
        tui.appendMessage('tool_error', result.message);
        tui.setStatus('');
      } else if (result.type === 'confirm') {
        tui.showConfirm(result.operation, result.message, async (confirmed) => {
          if (confirmed) {
            const cr = await agent.confirmOperation(result.operation, result.message);
            if (cr.type === 'response') tui.appendMessage('assistant', cr.content);
          } else {
            tui.appendMessage('system', '操作已取消');
          }
          tui.focusInput();
        });
        return;
      } else if (result.type === 'exit') {
        const sessionId = generateSessionId();
        await saveSession(projectDir, sessionId, agent.getMessages());
        tui.appendMessage('system', `会话已保存: ${sessionId}`);
        setTimeout(() => { tui.destroy(); process.exit(0); }, 400);
        return;
      }

      _updateFileViewer(agent.getMessages());
      tui.focusInput();
    });
  }

  return { start, tui, callbacks };
}
