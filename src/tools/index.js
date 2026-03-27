import { runBash, runReadFile, runWriteFile, runEditFile } from './files.js';
import { runGlob } from './glob.js';
import { runGrep } from './grep.js';
import { runTodo } from './todo.js';
import { runSubagent } from './subagent.js';

export const bashSchema = {
  type: "function",
  function: {
    name: "bash",
    description: "执行系统命令",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的命令" },
        timeout: { type: "number", description: "超时秒数(可选，默认60)" }
      },
      required: ["command"]
    }
  }
};

export const readFileSchema = {
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
};

export const writeFileSchema = {
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
};

export const editFileSchema = {
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
};

export const globSchema = {
  type: "function",
  function: {
    name: "glob",
    description: "通过模式匹配查找文件",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "glob 模式 (如 **/*.js)" },
        path: { type: "string", description: "搜索根目录 (可选，默认当前目录)" },
        limit: { type: "number", description: "最大结果数 (可选，默认100)" }
      },
      required: ["pattern"]
    }
  }
};

export const grepSchema = {
  type: "function",
  function: {
    name: "grep",
    description: "在文件中搜索内容",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "搜索的正则表达式或关键词" },
        output_mode: { 
          type: "string", 
          enum: ["content", "files", "count"],
          description: "输出模式: content显示内容, files只显示文件名, count显示数量"
        },
        type: { type: "string", description: "文件类型过滤 (如 js, ts, py)" },
        context: { type: "number", description: "上下文行数 (可选)" },
        path: { type: "string", description: "搜索路径 (可选，默认当前目录)" }
      },
      required: ["pattern"]
    }
  }
};

export const todoSchema = {
  type: "function",
  function: {
    name: "todo",
    description: "任务规划工具，用于创建和管理任务计划",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["set", "update", "get", "add", "clear"],
          description: "操作类型: set设置任务, update更新状态, get查看计划, add添加任务, clear清空"
        },
        tasks: {
          type: "array",
          description: "任务列表 (仅 set 操作需要)"
        },
        taskId: {
          type: "number",
          description: "任务 ID (仅 update 操作需要)"
        },
        status: {
          type: "string",
          enum: ["pending", "done", "cancelled"],
          description: "任务状态 (仅 update 操作需要)"
        },
        content: {
          type: "string",
          description: "任务内容 (仅 add 操作需要)"
        }
      },
      required: ["operation"]
    }
  }
};

export const subagentSchema = {
  type: "function",
  function: {
    name: "subagent",
    description: "子代理工具，在独立上下文中执行任务",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "子代理需要执行的任务" },
        context: { type: "string", description: "传递给子代理的上下文信息" }
      },
      required: ["task"]
    }
  }
};

export const toolRegistry = {
  bash: {
    handler: runBash,
    schema: bashSchema,
    getDetail: (args) => args.command,
    getOperation: () => 'bash'
  },
  read_file: {
    handler: runReadFile,
    schema: readFileSchema,
    getDetail: (args) => `path: ${args.path}`,
    getOperation: () => 'read'
  },
  write_file: {
    handler: runWriteFile,
    schema: writeFileSchema,
    getDetail: (args) => `path: ${args.path}`,
    getOperation: () => 'write'
  },
  edit_file: {
    handler: runEditFile,
    schema: editFileSchema,
    getDetail: (args) => `${args.operation} ${args.path}`,
    getOperation: (args) => args.operation
  },
  glob: {
    handler: runGlob,
    schema: globSchema,
    getDetail: (args) => `pattern: ${args.pattern}`,
    getOperation: () => 'read'
  },
  grep: {
    handler: runGrep,
    schema: grepSchema,
    getDetail: (args) => `pattern: ${args.pattern}, mode: ${args.output_mode || 'content'}`,
    getOperation: () => 'read'
  },
  todo: {
    handler: runTodo,
    schema: todoSchema,
    getDetail: (args) => `operation: ${args.operation}`,
    getOperation: () => 'read',
    isAsync: true
  },
  subagent: {
    handler: runSubagent,
    schema: subagentSchema,
    getDetail: (args) => `task: ${args.task?.substring(0, 30)}...`,
    getOperation: () => 'read',
    isAsync: true
  }
};

export const toolSchemas = Object.values(toolRegistry).map(t => t.schema);

export function getToolHandler(toolName) {
  return toolRegistry[toolName]?.handler;
}

export function getToolDetail(toolName, args) {
  return toolRegistry[toolName]?.getDetail(args) || '';
}

export function getToolOperation(toolName, args) {
  return toolRegistry[toolName]?.getOperation(args) || '';
}