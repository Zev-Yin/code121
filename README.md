# Code121 - AI CLI 工具

由南湖北一团队开发的本地 AI 命令行工具，可以通过自然语言执行 bash 命令、读写文件。

## 功能特性

- **Bash 命令执行**: 通过自然语言让 AI 执行系统命令
- **文件读取**: 支持按行范围读取文件内容
- **文件写入**: 创建或覆盖写入文件
- **文件编辑**: 支持替换、插入、删除操作
- **智能截断**: 大输出自动头尾采样，避免 token 浪费
- **语义压缩**: 历史工具输出自动压缩，节省上下文空间
- **安全防护**: 危险操作拦截/确认机制

## 安装

```bash
npm install
```

## 配置

设置 OpenAI API Key:

```bash
export OPENAI_API_KEY=your_api_key
```

或使用其他兼容的 API:

```bash
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_API_KEY=your_api_key
```

## 使用

```bash
node index.js
```

### 交互命令

| 命令 | 说明 |
|------|------|
| `exit` 或 `exit()` | 退出程序 |
| `DEBUG=true node index.js` | 开启调试模式 |

## 可用工具

### 1. bash - 执行系统命令

```javascript
{ command: "ls -la" }
```

### 2. read_file - 读取文件

```javascript
// 读取整个文件
{ path: "index.js" }

// 读取指定行范围 (0-based)
{ path: "index.js", offset: 10, limit: 50 }
```

### 3. write_file - 写入文件

```javascript
{ path: "test.txt", content: "Hello World" }
```

### 4. edit_file - 编辑文件

```javascript
// 替换第 10-20 行
{ path: "index.js", operation: "replace", start: 10, end: 20, content: "..." }

// 在第 5 行后插入
{ path: "index.js", operation: "insert", start: 5, content: "..." }

// 删除第 10 行
{ path: "index.js", operation: "delete", start: 10, end: 10 }
```

## 安全机制

### 风险等级

| 等级 | 操作示例 | 处理方式 |
|------|----------|----------|
| **critical** | `rm -rf /`, `dd`, `mkfs`, `shutdown` | 直接拒绝 |
| **high** | `rm -rf` 递归删除, `DROP TABLE`, `chmod 777` | 用户确认 |
| **medium** | 删除文件, 修改权限, 访问敏感路径 | 用户确认 |

### 拦截示例

```
>>> rm -rf /tmp

⚠️ 危险操作: 递归强制删除
   rm -rf /tmp
   是否确认执行? (yes/no): yes
```

## 智能截断策略

根据命令类型自动选择截断方式:

| 命令类型 | 策略 | 限制 |
|----------|------|------|
| `ls` | 头尾采样 | 100 + 30 行 |
| `npm` | 尾部优先 | 20 + 50 行 |
| `cat` | 头尾采样 | 50 + 30 行 |
| `grep` | 完整返回 | - |
| 错误输出 | 优先保留 | 100 + 100 行 |

## 项目结构

```
.
├── index.js          # 主程序入口
├── truncate.js       # 智能截断与压缩模块
├── security.js       # 安全检测模块
├── package.json      # 项目配置
└── README.md        # 说明文档
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEBUG` | 开启调试输出 | `false` |
| `OPENAI_MODEL_NAME` | 使用的模型 | `z-ai/glm-4.5-air:free` |
| `OPENAI_API_KEY` | API 密钥 | - |
| `OPENAI_BASE_URL` | API 地址 | `https://api.openai.com/v1` |

## 示例对话

```
>>> 列出当前目录的文件
>>> ls

[AI 执行 ls 命令并返回结果]

>>> 读取 index.js 的前 20 行
>>> 好的，我来读取 index.js 文件的前 20 行

[AI 调用 read_file 工具]

>>> 创建一个新文件 hello.txt，内容是 Hello World
>>> 好的，我来创建这个文件

[AI 调用 write_file 工具]
```

## 依赖

- `openai`: OpenAI API 客户端
- Node.js 内置模块: `child_process`, `fs/promises`, `readline`
