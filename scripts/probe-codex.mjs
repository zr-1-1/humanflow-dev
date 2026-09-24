import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppServerClient } from '../src/codex/app-server-client.mjs';

// Windows 下通过当前 Node 启动 npm 安装的入口，避免 shell 命令拼接。
const cli = process.env.HUMANFLOW_CODEX_JS ?? (process.env.APPDATA
  ? join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
  : undefined);
if (!cli || !existsSync(cli)) {
  console.error('未找到 Codex JS 入口，请设置 HUMANFLOW_CODEX_JS 为 codex.js 的绝对路径。');
  process.exitCode = 1;
} else {
  const client = new AppServerClient(process.execPath, [cli, 'app-server', '--listen', 'stdio://']);
  try {
    await client.initialize();
    console.log('PASS: App Server 启动与 initialize / initialized 握手完成。');
    // 只检查认证是否存在，不输出账户标识、Token 或完整返回值。
    const result = await client.request('account/read', { refreshToken: false });
    console.log(`PASS: account/read 响应正常；账户状态：${result.account ? '已有账户' : '未提供账户'}。`);
    console.log('未创建会话、未调用模型、未请求文件修改。');
  } catch (error) {
    console.error(`验证失败：${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
