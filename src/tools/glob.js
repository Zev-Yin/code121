import { readFile, stat } from "fs/promises";
import { resolve, relative } from "path";
import { glob as globSync } from "glob";
import { promisify } from "util";

const glob = promisify(globSync);

export async function runGlob(pattern = "**/*", path = ".", limit = 100) {
  try {
    const resolvedPath = resolve(process.cwd(), path);
    const matches = await glob(pattern, {
      cwd: resolvedPath,
      absolute: false,
      nodir: false,
      dot: true,
    });

    if (matches.length === 0) {
      return `未找到匹配 "${pattern}" 的文件`;
    }

    const limited = matches.slice(0, limit);
    const fileInfos = await Promise.all(
      limited.map(async (file) => {
        try {
          const stats = await stat(resolve(resolvedPath, file));
          const size = stats.size;
          const mtime = stats.mtime.toISOString().split('T')[0];
          return { file, size, mtime };
        } catch {
          return { file, size: 0, mtime: 'unknown' };
        }
      })
    );

    let result = `找到 ${matches.length} 个匹配 (显示前 ${limited.length} 个):\n\n`;
    
    for (const info of fileInfos) {
      const sizeStr = info.size < 1024 
        ? `${info.size}B` 
        : info.size < 1024 * 1024 
          ? `${(info.size / 1024).toFixed(1)}KB`
          : `${(info.size / 1024 / 1024).toFixed(1)}MB`;
      result += `${info.file} (${sizeStr}, ${info.mtime})\n`;
    }

    if (matches.length > limit) {
      result += `\n[... 还有 ${matches.length - limit} 个结果未显示 ...]`;
    }

    return result;
  } catch (error) {
    return `搜索失败: ${error.message}`;
  }
}