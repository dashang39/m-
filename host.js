// 源引擎宿主：在 Node 中执行 JS 源插件（lanerc.js 及各第三方源）
// 同步 HTTP 通过 curl 子进程实现，因为源插件是同步调用风格
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

function makeHttp(ua = 'Dart/3.9.2') {
  function call(method, url, body, optsJson) {
    let o = {};
    try { o = optsJson ? JSON.parse(optsJson) : {}; } catch (e) { }
    const headers = o.headers || {};
    const timeoutMs = Number(o.timeout || 20000);
    const args = ['-sS', '--compressed', '-X', method, '-m', String(Math.max(1, Math.ceil(timeoutMs / 1000)))];
    for (const k of Object.keys(headers)) {
      if (headers[k] === null || headers[k] === undefined) continue;
      args.push('-H', `${k}: ${headers[k]}`);
    }
    if (method === 'POST' || method === 'PUT') args.push('--data-binary', '@-');
    args.push(String(url));
    const r = spawnSync('curl.exe', args, {
      input: (method === 'POST' || method === 'PUT') ? Buffer.from(String(body ?? ''), 'utf8') : undefined,
      maxBuffer: 128 * 1024 * 1024,
      encoding: null,
      windowsHide: true
    });
    if (r.error) throw new Error('spawn curl: ' + r.error.message);
    if (r.status !== 0) throw new Error('curl exit ' + r.status + ': ' + String(r.stderr || '').slice(0, 300));
    const charset = String(o.charset || '').toUpperCase();
    return charset.indexOf('8859') >= 0 ? r.stdout.toString('latin1') : r.stdout.toString('utf8');
  }
  return call;
}

/**
 * 加载一个源脚本，返回可调用的宿主。
 * @param {string} file  源 .js 绝对路径
 * @param {object} opts  { ext, storageFile }
 */
function loadSource(file, opts = {}) {
  const logs = [];
  const storage = new Map();
  const storageFile = opts.storageFile || null;

  if (storageFile && fs.existsSync(storageFile)) {
    try {
      const obj = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      for (const k of Object.keys(obj)) storage.set(k, String(obj[k]));
    } catch (e) { }
  }
  const persist = () => {
    if (!storageFile) return;
    try {
      const obj = {};
      for (const [k, v] of storage) obj[k] = v;
      fs.mkdirSync(path.dirname(storageFile), { recursive: true });
      fs.writeFileSync(storageFile, JSON.stringify(obj));
    } catch (e) { }
  };

  const http = makeHttp();

  // 宿主 crypto：部分源（AppV7 一类）依赖 AES-CBC / RSA / base64
  const nodeCrypto = require('crypto');
  const toBuf = (v, fmt) => {
    const f = String(fmt || 'utf8').toLowerCase();
    if (f === 'hex') return Buffer.from(String(v), 'hex');
    if (f === 'base64') return Buffer.from(String(v), 'base64');
    return Buffer.from(String(v), 'utf8');
  };
  const fromBuf = (b, fmt) => {
    const f = String(fmt || 'utf8').toLowerCase();
    if (f === 'hex') return b.toString('hex');
    if (f === 'base64') return b.toString('base64');
    return b.toString('utf8');
  };
  function aesRun(decrypt, data, key, opt) {
    opt = opt || {};
    const kb = toBuf(key, opt.keyFormat || 'utf8');
    if (![16, 24, 32].includes(kb.length)) throw new Error('bad aes key length ' + kb.length);
    const alg = 'aes-' + (kb.length * 8) + '-' + String(opt.mode || 'CBC').toLowerCase();
    const iv = opt.iv ? toBuf(opt.iv, opt.ivFormat || 'utf8') : null;
    const input = toBuf(data, opt.input || 'utf8');
    const c = decrypt
      ? nodeCrypto.createDecipheriv(alg, kb, iv)
      : nodeCrypto.createCipheriv(alg, kb, iv);
    if (String(opt.padding || '').toLowerCase() === 'none') c.setAutoPadding(false);
    return fromBuf(Buffer.concat([c.update(input), c.final()]), opt.output || 'utf8');
  }
  const cryptoApi = {
    base64: {
      encode: (s, opt) => toBuf(s, opt && opt.input).toString('base64'),
      decode: (s, opt) => fromBuf(Buffer.from(String(s), 'base64'), opt && opt.output)
    },
    aes: {
      encrypt: (data, key, opt) => aesRun(false, data, key, opt),
      decrypt: (data, key, opt) => aesRun(true, data, key, opt)
    },
    rsa: {
      decrypt(b64, pem, opt) {
        opt = opt || {};
        const pad = String(opt.padding || 'PKCS1').toUpperCase();
        const padding = pad === 'OAEP' ? nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING : nodeCrypto.constants.RSA_PKCS1_PADDING;
        const out = nodeCrypto.privateDecrypt({ key: pem, padding }, Buffer.from(String(b64), 'base64'));
        return fromBuf(out, opt.output || 'utf8');
      }
    },
    md5: (s) => nodeCrypto.createHash('md5').update(String(s), 'utf8').digest('hex'),
    sha256: (s) => nodeCrypto.createHash('sha256').update(String(s), 'utf8').digest('hex'),
    hmac: (alg, key, data) => nodeCrypto.createHmac(String(alg || 'sha256'), String(key)).update(String(data)).digest('hex')
  };

  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    ext: opts.ext || {},
    randomHex: (n) => nodeCrypto.randomBytes(Math.max(1, Number(n) || 16)).toString('hex'),
    randomBytes: (n) => Array.from(nodeCrypto.randomBytes(Math.max(1, Number(n) || 16))),
    base64Encode: (s, opt) => toBuf(s, (opt && (opt.input || opt.inputFormat)) || 'utf8').toString('base64'),
    base64Decode: (s, opt) => fromBuf(Buffer.from(String(s), 'base64'), (opt && (opt.output || opt.outputFormat)) || 'utf8'),
    md5: (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex'),
    sha1: (s) => crypto.createHash('sha1').update(String(s), 'utf8').digest('hex'),
    sha256: (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'),
    /** 源引擎约定：matchAll(text, patternString) -> JSON 数组（每项为捕获组数组） */
    matchAll: (text, pattern, flags) => {
      const out = [];
      try {
        const re = new RegExp(String(pattern), flags || 'g');
        const s = String(text == null ? '' : text);
        let m;
        let guard = 0;
        while ((m = re.exec(s)) !== null && guard++ < 5000) {
          out.push(m.length > 1 ? m.slice(1) : [m[0]]);
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      } catch (e) { }
      return JSON.stringify(out);
    },
    parseJson: (s) => { try { return JSON.parse(String(s)); } catch (e) { return null; } },
    encodeUri: (s) => encodeURIComponent(String(s)),
    decodeUri: (s) => { try { return decodeURIComponent(String(s)); } catch (e) { return String(s); } },
    timestamp: () => Date.now(),
    log: (m) => { logs.push(String(m)); if (logs.length > 500) logs.shift(); },
    sleep: (ms) => { const end = Date.now() + Number(ms || 0); while (Date.now() < end) { } },
    getItem: (k) => (storage.has(String(k)) ? storage.get(String(k)) : ''),
    setItem: (k, v) => { storage.set(String(k), String(v)); persist(); },
    removeItem: (k) => { storage.delete(String(k)); persist(); },
    request: (url, o) => http('GET', url, null, o),
    post: (url, payload, o) => http('POST', url, payload, o),
    http: {
      get: (url, o) => ({ status: 200, body: http('GET', url, null, o) }),
      post2: (url, payload, o) => ({ status: 200, body: http('POST', url, payload, o) })
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: path.basename(file) });

  const api = {
    file,
    sandbox,
    logs,
    has: (fn) => typeof sandbox[fn] === 'function',
    call(fn, ...args) {
      const f = sandbox[fn];
      if (typeof f !== 'function') throw new Error('源没有导出函数: ' + fn);
      return f.apply(sandbox, args);
    },
    /** 带超时/异常保护的调用，返回 {ok, data|error, ms} */
    tryCall(fn, ...args) {
      const t0 = Date.now();
      try {
        const out = api.call(fn, ...args);
        return { ok: true, data: out, ms: Date.now() - t0 };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e), ms: Date.now() - t0 };
      }
    }
  };
  return api;
}

module.exports = { loadSource };
