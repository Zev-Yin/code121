import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir } from "os";

const COMMANDS_DIR = '.code121/command';
const CONFIG_FILE = '.code121/config.json';

export const BUILTIN_COMMANDS = {
  '/exit': {
    description: '退出程序',
    execute: () => ({ type: 'exit' })
  },
  '/help': {
    description: '显示所有可用命令和技能',
    execute: () => ({ type: 'help' })
  },
  '/clear': {
    description: '清空对话历史',
    execute: () => ({ type: 'clear' })
  },
  '/debug': {
    description: '切换调试模式',
    execute: () => ({ type: 'debug' })
  },
  '/model': {
    description: '切换使用的模型',
    execute: (current, model) => ({ type: 'model', value: model }),
    needsArg: true,
    argName: '<model-name>'
  },
  '/plan': {
    description: '进入规划模式',
    execute: () => ({ type: 'plan', value: true })
  },
  '/apply': {
    description: '应用计划并执行',
    execute: () => ({ type: 'plan', value: false })
  },
  '/sessions': {
    description: '列出最近会话',
    execute: () => ({ type: 'sessions' })
  },
  '/resume': {
    description: '恢复指定会话',
    execute: (current, sessionId) => ({ type: 'resume', value: sessionId }),
    needsArg: true,
    argName: '<session-id>'
  },
  '/save': {
    description: '保存当前会话',
    execute: () => ({ type: 'save' })
  },
  '/new': {
    description: '开始新会话',
    execute: () => ({ type: 'new' })
  }
};

export async function parseCommand(input) {
  const trimmed = input.trim();
  
  for (const [cmd, handler] of Object.entries(BUILTIN_COMMANDS)) {
    if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
      let arg = '';
      if (handler.needsArg) {
        arg = trimmed.slice(cmd.length).trim();
        if (!arg) {
          return { type: 'error', message: `命令 ${cmd} 需要参数: ${handler.argName}` };
        }
      }
      return handler.execute(arg);
    }
  }
  
  if (trimmed.startsWith('/')) {
    const skillName = trimmed.slice(1).split(' ')[0];
    return { type: 'skill', name: skillName };
  }
  
  return null;
}

export async function loadSkill(skillName) {
  const config = await loadConfig();
  const baseDir = config?.projectDir || process.cwd();
  
  const skillPath = join(baseDir, COMMANDS_DIR, `${skillName}.md`);
  
  try {
    if (existsSync(skillPath)) {
      const content = await readFile(skillPath, 'utf-8');
      return { type: 'skill', name: skillName, content };
    }
  } catch (error) {
    console.error(`加载技能 ${skillName} 失败:`, error.message);
  }
  
  return null;
}

export async function listSkills() {
  const config = await loadConfig();
  const baseDir = config?.projectDir || process.cwd();
  const commandDir = join(baseDir, COMMANDS_DIR);
  
  const skills = [];
  
  try {
    if (existsSync(commandDir)) {
      const files = await readdir(commandDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const skillName = file.slice(0, -3);
          try {
            const content = await readFile(join(commandDir, file), 'utf-8');
            const description = content.split('\n')[0]?.replace(/^#*\s*/, '') || skillName;
            skills.push({ name: skillName, description });
          } catch {
            skills.push({ name: skillName, description: '(无法读取)' });
          }
        }
      }
    }
  } catch (error) {
    console.error('列出技能失败:', error.message);
  }
  
  return skills;
}

export async function loadConfig() {
  const configPaths = [
    resolve(process.cwd(), CONFIG_FILE),
    resolve(homedir(), CONFIG_FILE)
  ];
  
  for (const configPath of configPaths) {
    try {
      if (existsSync(configPath)) {
        const content = await readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        return {
          ...config,
          projectDir: dirname(configPath)
        };
      }
    } catch (error) {
      console.error(`加载配置文件 ${configPath} 失败:`, error.message);
    }
  }
  
  return null;
}

export async function saveConfig(config) {
  const configPath = resolve(process.cwd(), CONFIG_FILE);
  
  try {
    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }
    
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('保存配置文件失败:', error.message);
    return false;
  }
}

export async function initProjectConfig() {
  const configPath = resolve(process.cwd(), CONFIG_FILE);
  
  if (!existsSync(configPath)) {
    const defaultConfig = {
      model: process.env.OPENAI_MODEL_NAME || 'z-ai/glm-4.5-air:free',
      systemPrompt: '',
      contextFiles: []
    };
    
    await saveConfig(defaultConfig);
    console.log(`已创建默认配置文件: ${configPath}`);
  }
  
  const commandDir = resolve(process.cwd(), COMMANDS_DIR);
  if (!existsSync(commandDir)) {
    await mkdir(commandDir, { recursive: true });
    console.log(`已创建命令目录: ${commandDir}`);
  }
}