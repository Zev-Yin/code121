import { exec } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { smartTruncate } from '../../truncate.js';

export function runBash(command, timeout = 60) {
  return new Promise((resolve) => {
    exec(command, { timeout: timeout * 1000 }, (error, stdout, stderr) => {
      resolve(stdout + stderr);
    });
  });
}

export async function runReadFile(path, offset, limit) {
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

export async function runWriteFile(path, content) {
  try {
    await writeFile(path, content, 'utf-8');
    const lines = content.split('\n').length;
    return `文件写入成功: ${path} (${lines} 行)`;
  } catch (error) {
    return `写入文件失败: ${error.message}`;
  }
}

export async function runEditFile(path, operation, start, end, content) {
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