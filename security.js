const DANGEROUS_RULES = [
  // Critical - 直接拒绝
  { pattern: /^rm\s+-rf\s+\/$/, level: 'critical', msg: '危险: 递归删除根目录' },
  { pattern: /^rm\s+-rf\s+\//, level: 'critical', msg: '危险: 递归删除系统目录' },
  { pattern: /^dd\s+if=/, level: 'critical', msg: '危险: 磁盘写入操作' },
  { pattern: /^dd\s+of=/, level: 'critical', msg: '危险: 磁盘写入操作' },
  { pattern: /^mkfs/, level: 'critical', msg: '危险: 格式化操作' },
  { pattern: />\s*\/dev\//, level: 'critical', msg: '危险: 设备写入' },
  { pattern: /^:\(\)\{/, level: 'critical', msg: '危险: fork 炸弹' },
  { pattern: /^shutdown/i, level: 'critical', msg: '危险: 关机命令' },
  { pattern: /^reboot/i, level: 'critical', msg: '危险: 重启命令' },
  { pattern: /^init\s+0/i, level: 'critical', msg: '危险: 关机命令' },
  { pattern: /^init\s+6/i, level: 'critical', msg: '危险: 重启命令' },

  // High - 需要确认
  { pattern: /^rm\s+-rf\s+/, level: 'high', msg: '递归强制删除' },
  { pattern: /^rm\s+-r\s+/, level: 'high', msg: '递归删除' },
  { pattern: /^rmdir\s+/, level: 'medium', msg: '删除目录' },
  { pattern: /^del\s+/, level: 'medium', msg: '删除文件' },
  { pattern: /^unlink\s+/, level: 'medium', msg: '删除文件链接' },
  { pattern: /^DROP\s+TABLE/i, level: 'high', msg: '删除数据库表' },
  { pattern: /^DELETE\s+FROM/i, level: 'high', msg: '删除数据库记录' },
  { pattern: /^TRUNCATE/i, level: 'high', msg: '清空数据库表' },
  { pattern: /^chmod\s+777/, level: 'high', msg: '过度授权 (777)' },
  { pattern: /^chmod\s+-R\s+777/, level: 'high', msg: '递归过度授权' },
  { pattern: /^chown\s+-R/, level: 'high', msg: '递归修改所有者' },

  // Medium - 需要确认
  { pattern: /^chmod\s+[0-7]{3}/, level: 'medium', msg: '修改文件权限' },
  { pattern: /^chown\s+/, level: 'medium', msg: '修改文件所有者' },
  { pattern: /\/etc\/passwd$/, level: 'medium', msg: '访问系统用户文件' },
  { pattern: /\/etc\/shadow$/, level: 'medium', msg: '访问系统密码文件' },
  { pattern: /\/\.ssh\//, level: 'medium', msg: '访问SSH目录' },
  { pattern: /\/root\//, level: 'medium', msg: '访问root目录' },
  { pattern: /^kill\s+-9/, level: 'medium', msg: '强制终止进程' },
  { pattern: /^pkill\s+/, level: 'medium', msg: '终止进程' },
  { pattern: /^killall\s+/, level: 'medium', msg: '终止所有进程' },
];

function checkDangerous(command) {
  if (!command) return { dangerous: false };

  for (const rule of DANGEROUS_RULES) {
    if (rule.pattern.test(command)) {
      return {
        dangerous: true,
        level: rule.level,
        msg: rule.msg,
        pattern: rule.pattern.toString()
      };
    }
  }
  return { dangerous: false };
}

function checkFilePath(path, operation) {
  if (!path) return { dangerous: false };

  const dangerousPaths = [
    /^\/etc\/(passwd|shadow|group|gshadow)$/,
    /^\/boot\//,
    /^\/proc\//,
    /^\/sys\//,
    /^\/dev\//,
  ];

  const writeOperations = ['write', 'replace', 'delete', 'insert'];

  for (const pattern of dangerousPaths) {
    if (pattern.test(path)) {
      const level = writeOperations.includes(operation) ? 'high' : 'medium';
      return {
        dangerous: true,
        level,
        msg: `访问系统敏感路径: ${path}`
      };
    }
  }

  return { dangerous: false };
}

export { checkDangerous, checkFilePath, DANGEROUS_RULES };
