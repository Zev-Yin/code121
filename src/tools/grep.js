import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";

const execAsync = promisify(exec);

export async function runGrep(
  pattern,
  output_mode = "content",
  type = "",
  context = 0,
  path = "."
) {
  try {
    const hasRipgrep = await checkRipgrep();
    
    if (hasRipgrep) {
      return await runRipgrep(pattern, output_mode, type, context, path);
    } else {
      return await runFallbackGrep(pattern, output_mode, type, context, path);
    }
  } catch (error) {
    return `搜索失败: ${error.message}`;
  }
}

async function checkRipgrep() {
  try {
    await execAsync("which rg");
    return true;
  } catch {
    return false;
  }
}

async function runRipgrep(pattern, output_mode, type, context, path) {
  let cmd = `rg -n`;
  
  if (output_mode === "files") {
    cmd += " -l";
  } else if (output_mode === "count") {
    cmd += " -c";
  }
  
  if (context > 0) {
    cmd += ` -C ${context}`;
  }
  
  if (type) {
    cmd += ` -t ${type}`;
  }
  
  cmd += ` ${JSON.stringify(pattern)} ${JSON.stringify(path)}`;
  
  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  
  if (output_mode === "content") {
    const lines = stdout.split('\n').filter(l => l.trim());
    if (lines.length > 200) {
      return lines.slice(0, 200).join('\n') + `\n\n[... 还有 ${lines.length - 200} 行 ...]`;
    }
    return stdout || '无匹配结果';
  }
  
  return stdout || '无匹配结果';
}

async function runFallbackGrep(pattern, output_mode, type, context, path) {
  const { stdout } = await execAsync(`find ${JSON.stringify(path)} -type f${type ? ` -name "*.${type}"` : ''}`, { maxBuffer: 10 * 1024 * 1024 });
  
  const files = stdout.split('\n').filter(f => f.trim()).slice(0, 100);
  const results = [];
  
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');
      const matches = [];
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(pattern)) {
          matches.push({ line: i + 1, content: lines[i] });
          
          if (context > 0) {
            for (let j = 1; j <= context; j++) {
              if (i + j < lines.length) matches.push({ line: i + j + 1, content: lines[i + j], isContext: true });
              if (i - j >= 0) matches.push({ line: i - j + 1, content: lines[i - j], isContext: true });
            }
          }
        }
      }
      
      if (matches.length > 0) {
        if (output_mode === "count") {
          results.push(`${file}: ${matches.filter(m => !m.isContext).length}`);
        } else if (output_mode === "files") {
          results.push(file);
        } else {
          results.push(`${file}:`);
          results.push(...matches.map(m => `  ${m.line}: ${m.content}`));
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  
  if (results.length === 0) return '无匹配结果';
  
  if (output_mode === "files") {
    return results.join('\n');
  }
  
  const content = results.join('\n');
  const lines = content.split('\n');
  if (lines.length > 200) {
    return lines.slice(0, 200).join('\n') + `\n\n[... 还有 ${lines.length - 200} 行 ...]`;
  }
  
  return content;
}