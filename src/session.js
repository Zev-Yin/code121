import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir } from "os";

const SESSIONS_DIR = '.code121/sessions';

export function generateSessionId() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export async function getSessionsDir(projectDir) {
  return resolve(projectDir, SESSIONS_DIR);
}

export async function saveSession(projectDir, sessionId, messages) {
  const sessionsDir = await getSessionsDir(projectDir);
  
  try {
    if (!existsSync(sessionsDir)) {
      await mkdir(sessionsDir, { recursive: true });
    }
    
    const sessionPath = resolve(sessionsDir, `${sessionId}.json`);
    await writeFile(sessionPath, JSON.stringify({
      id: sessionId,
      messages,
      savedAt: new Date().toISOString()
    }, null, 2), 'utf-8');
    
    return true;
  } catch (error) {
    console.error('保存会话失败:', error.message);
    return false;
  }
}

export async function loadSession(projectDir, sessionId) {
  const sessionsDir = await getSessionsDir(projectDir);
  const sessionPath = resolve(sessionsDir, `${sessionId}.json`);
  
  try {
    if (existsSync(sessionPath)) {
      const content = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(content);
      return session.messages;
    }
  } catch (error) {
    console.error('加载会话失败:', error.message);
  }
  
  return null;
}

export async function listSessions(projectDir) {
  const sessionsDir = await getSessionsDir(projectDir);
  const sessions = [];
  
  try {
    if (existsSync(sessionsDir)) {
      const files = await readdir(sessionsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(resolve(sessionsDir, file), 'utf-8');
            const session = JSON.parse(content);
            const msgCount = session.messages?.length || 0;
            const savedAt = session.savedAt ? new Date(session.savedAt).toLocaleString() : '未知';
            sessions.push({
              id: session.id,
              messageCount: msgCount,
              savedAt
            });
          } catch {
            // skip invalid sessions
          }
        }
      }
    }
  } catch (error) {
    console.error('列出会话失败:', error.message);
  }
  
  // Sort by ID (newest first)
  sessions.sort((a, b) => b.id.localeCompare(a.id));
  
  return sessions.slice(0, 10);
}

export async function deleteSession(projectDir, sessionId) {
  const sessionsDir = await getSessionsDir(projectDir);
  const sessionPath = resolve(sessionsDir, `${sessionId}.json`);
  
  try {
    if (existsSync(sessionPath)) {
      await unlink(sessionPath);
      return true;
    }
  } catch (error) {
    console.error('删除会话失败:', error.message);
  }
  
  return false;
}

export async function getLatestSession(projectDir) {
  const sessions = await listSessions(projectDir);
  if (sessions.length > 0) {
    return sessions[0].id;
  }
  return null;
}