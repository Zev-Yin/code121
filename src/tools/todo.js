import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

const PLAN_FILE = '.code121/current-plan.json';

let currentPlan = {
  tasks: [],
  createdAt: null,
  updatedAt: null
};

export async function loadPlan(projectDir) {
  const planPath = resolve(projectDir, PLAN_FILE);
  
  try {
    if (existsSync(planPath)) {
      const content = await readFile(planPath, 'utf-8');
      currentPlan = JSON.parse(content);
      return currentPlan;
    }
  } catch (error) {
    console.error('加载计划失败:', error.message);
  }
  
  return { tasks: [], createdAt: null, updatedAt: null };
}

export async function savePlan(projectDir, plan) {
  const planPath = resolve(projectDir, PLAN_FILE);
  
  try {
    const planDir = dirname(planPath);
    if (!existsSync(planDir)) {
      await mkdir(planDir, { recursive: true });
    }
    
    plan.updatedAt = new Date().toISOString();
    if (!plan.createdAt) {
      plan.createdAt = plan.updatedAt;
    }
    
    await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    currentPlan = plan;
    return true;
  } catch (error) {
    console.error('保存计划失败:', error.message);
    return false;
  }
}

export async function runTodo(operation, data, projectDir) {
  const plan = await loadPlan(projectDir);
  
  switch (operation) {
    case 'set':
      if (data && data.tasks) {
        plan.tasks = data.tasks.map((t, i) => ({
          id: i + 1,
          content: t.content || t,
          status: t.status || 'pending',
          priority: t.priority || 'normal'
        }));
        await savePlan(projectDir, plan);
        return `已创建任务计划，包含 ${plan.tasks.length} 个任务`;
      }
      return '无效的任务数据';
    
    case 'update':
      if (data && data.taskId) {
        const task = plan.tasks.find(t => t.id === data.taskId);
        if (task) {
          if (data.status) task.status = data.status;
          if (data.content) task.content = data.content;
          await savePlan(projectDir, plan);
          return `任务 ${data.taskId} 已更新: ${task.content} [${task.status}]`;
        }
        return `未找到任务 #${data.taskId}`;
      }
      return '无效的任务 ID';
    
    case 'get':
      if (plan.tasks.length === 0) {
        return '当前没有任务计划';
      }
      
      let output = '## 当前任务计划\n\n';
      
      const pending = plan.tasks.filter(t => t.status === 'pending');
      const done = plan.tasks.filter(t => t.status === 'done');
      
      if (pending.length > 0) {
        output += '### 待完成\n';
        for (const task of pending) {
          output += `- [ ] ${task.id}. ${task.content}\n`;
        }
        output += '\n';
      }
      
      if (done.length > 0) {
        output += '### 已完成\n';
        for (const task of done) {
          output += `- [x] ${task.id}. ${task.content}\n`;
        }
      }
      
      return output;
    
    case 'clear':
      plan.tasks = [];
      await savePlan(projectDir, plan);
      return '任务计划已清空';
    
    case 'add':
      if (data && data.content) {
        plan.tasks.push({
          id: plan.tasks.length + 1,
          content: data.content,
          status: 'pending',
          priority: data.priority || 'normal'
        });
        await savePlan(projectDir, plan);
        return `已添加任务: ${data.content}`;
      }
      return '无效的任务内容';
    
    default:
      return `未知操作: ${operation}`;
  }
}

export function getCurrentPlan() {
  return currentPlan;
}