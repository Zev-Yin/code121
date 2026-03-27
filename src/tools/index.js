import { runBash, runReadFile, runWriteFile, runEditFile } from '../files.js';

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