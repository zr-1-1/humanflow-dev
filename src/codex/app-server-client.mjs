import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

// 只负责协议传输；不自动创建任务、批准工具或应用代码。
export class AppServerClient extends EventEmitter {
  #process;
  #pending = new Map();
  #nextId = 1;
  #closed = false;
  #exit;
  toolHandler;

  constructor(command, args = [], { cwd = process.cwd(), timeoutMs = 15000, env } = {}) {
    super();
    this.timeoutMs = timeoutMs;
    this.#process = spawn(command, args, {
      cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    this.#exit = new Promise(resolve => this.#process.once('close', resolve));
    this.#process.on('error', error => this.#fail(error));
    this.#process.stdin.on('error', error => this.#fail(error));
    this.#process.on('close', () => this.#fail(new Error('App Server 已关闭')));
    this.#process.stderr.on('data', data => this.emit('diagnostic', data.toString()));
    const lines = createInterface({ input: this.#process.stdout });
    lines.on('line', line => {
      try {
        this.#receive(JSON.parse(line));
      } catch (error) {
        this.#fail(error);
        this.#process.kill();
      }
    });
  }

  #fail(error) {
    const wasClosed = this.#closed;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    if (!wasClosed) this.emit('disconnected', error);
  }

  #send(message) {
    if (this.#closed) throw new Error('App Server 连接不可用');
    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(message) {
    if (message.method && Object.hasOwn(message, 'id')) {
      if (message.method === 'item/tool/call' && this.toolHandler) {
        Promise.resolve().then(() => this.toolHandler(message.params)).then(result => {
          if (!this.#closed) this.#send({ id: message.id, result });
        }, () => {
          if (!this.#closed) this.#send({ id: message.id, result: { success: false,
            contentItems: [{ type: 'inputText', text: '联网工具执行失败；不能声称已完成搜索。' }] } });
        }).catch(() => {});
        return;
      }
      // 第一阶段不执行服务端请求，也不默许任何审批。
      this.#send({ id: message.id, error: {
        code: -32601, message: 'HumanFlow transport probe does not handle server requests',
      } });
      this.emit('unhandledRequest', message.method);
      return;
    }
    if (message.method) {
      this.emit('notification', message);
      return;
    }
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.#nextId++;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`请求超时：${method}`));
      }, this.timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      clientInfo: { name: 'humanflow', title: 'HumanFlow', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    this.#send({ method: 'initialized', params: {} });
    return result;
  }

  async close() {
    this.#process.stdin.end();
    const timer = setTimeout(() => this.#process.kill(), 2000);
    try {
      await this.#exit;
    } finally {
      clearTimeout(timer);
    }
  }
}
