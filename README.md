# Code121 - AI CLI Tool

A local AI command-line tool developed by 南湖北一 team. Execute bash commands and manage files through natural language.

## Features

- **Bash Execution**: Run system commands via natural language
- **File Reading**: Read files with optional line range
- **File Writing**: Create or overwrite files
- **File Editing**: Replace, insert, or delete operations
- **Smart Truncation**: Auto head-tail sampling for large outputs to save tokens
- **Semantic Compression**: Compress historical tool outputs to save context space
- **Security Protection**: Dangerous operation blocking/confirmation mechanism
- **Timeout Control**: Model can customize command timeout

## Installation

```bash
npm install
```

## Configuration

Set OpenAI API Key:

```bash
export OPENAI_API_KEY=your_api_key
```

Or use other compatible APIs:

```bash
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_API_KEY=your_api_key
```

## Usage

```bash
node index.js
```

### Interactive Commands

| Command | Description |
|---------|-------------|
| `exit` or `exit()` | Exit program |
| `DEBUG=true node index.js` | Enable debug mode |

## Status Display

Real-time status during execution:

| Status | Display |
|--------|---------|
| AI Thinking | `[🤔] AI 正在思考...` |
| Tool Running | `[⏳] 执行工具: bash` |
| Tool Done | `[✅] 工具执行完成: bash` |
| Tool Failed | `[❌] 操作已取消` |
| Danger Confirm | `[⚠️] 危险操作确认...` |

## Available Tools

### 1. bash - Execute System Commands

```javascript
// Basic usage
{ command: "ls -la" }

// Set timeout (seconds), recommended for long-running tasks
{ command: "npm install", timeout: 120 }
```

### 2. read_file - Read File Content

```javascript
// Read entire file
{ path: "index.js" }

// Read specific line range (0-based)
{ path: "index.js", offset: 10, limit: 50 }
```

### 3. write_file - Write File

```javascript
{ path: "test.txt", content: "Hello World" }
```

### 4. edit_file - Edit File

```javascript
// Replace lines 10-20
{ path: "index.js", operation: "replace", start: 10, end: 20, content: "..." }

// Insert after line 5
{ path: "index.js", operation: "insert", start: 5, content: "..." }

// Delete line 10
{ path: "index.js", operation: "delete", start: 10, end: 10 }
```

## Security Mechanism

### Risk Levels

| Level | Example Operations | Handling |
|-------|-------------------|----------|
| **critical** | `rm -rf /`, `dd`, `mkfs`, `shutdown` | Direct rejection |
| **high** | `rm -rf` recursive delete, `DROP TABLE`, `chmod 777` | User confirmation |
| **medium** | Delete files, modify permissions, access sensitive paths | User confirmation |

### Blocking Example

```
>>> rm -rf /tmp

⚠️ 危险操作: 递归强制删除
   rm -rf /tmp
   是否确认执行? (yes/no): yes
```

## Timeout Mechanism

The `bash` tool supports the `timeout` parameter, controlled by the model based on task complexity:

| Scenario | Recommended Timeout |
|----------|---------------------|
| Simple commands (ls, cat) | 30 seconds |
| Package managers (npm, pip) | 60-120 seconds |
| Build/compile | 120-300 seconds |
| Default | 60 seconds |

After timeout, the model receives `[TIMEOUT] 命令超时，模型可尝试更高效的方法或调整超时时间` and can:
- Try faster alternative commands
- Retry with longer timeout
- Suggest manual operation to user

## Smart Truncation Strategy

Automatically selects truncation method based on command type:

| Command Type | Strategy | Limit |
|--------------|----------|-------|
| `ls` | Head-tail sampling | 100 + 30 lines |
| `npm` | Tail-first | 20 + 50 lines |
| `cat` | Head-tail sampling | 50 + 30 lines |
| `grep` | Full return | - |
| Error output | Preserve first | 100 + 100 lines |

## Project Structure

```
.
├── index.js          # Main entry point
├── truncate.js       # Smart truncation & compression module
├── security.js       # Security detection module
├── package.json      # Project configuration
├── README.md         # English documentation
└── README.zh.md     # Chinese documentation
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEBUG` | Enable debug output | `false` |
| `OPENAI_MODEL_NAME` | Model to use | `z-ai/glm-4.5-air:free` |
| `OPENAI_API_KEY` | API key | - |
| `OPENAI_BASE_URL` | API address | `https://api.openai.com/v1` |

## Example Conversation

```
>>> List files in current directory
>>> ls

[AI executes ls command and returns result]

>>> Read first 20 lines of index.js
>>> 好的，我来读取 index.js 文件的前 20 行

[AI calls read_file tool]

>>> Create a new file hello.txt with content "Hello World"
>>> 好的，我来创建这个文件

[AI calls write_file tool]
```

## Dependencies

- `openai`: OpenAI API client
- Node.js built-in modules: `child_process`, `fs/promises`, `readline`

---

For Chinese documentation, see [README.zh.md](./README.zh.md)