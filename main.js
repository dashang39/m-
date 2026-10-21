// M记 - Electron 主进程
const { app, BrowserWindow, ipcMain, shell, nativeTheme, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const maccms = require('./maccms');
const xifan = require('./xifan');
const generic = require('./generic');
const cycani = require('./cycani');

const SOURCE_DIR = path.join(__dirname, 'sources');
const DATA_DIR = path.join(app.getPath('userData'));
const STORE_FILE = path.join(DATA_DIR, 'store.json');

// ---------- 诊断日志 ----------
const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024;
const logBuf = [];

function stamp(d) {
  const t = d || new Date();
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`;
}
function nowStr() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
}
function toText(a) {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a); } catch (e) { return String(a); } }
  return String(a);
}
function writeLog(level, args) {
  const line = `[${nowStr()}] [${level}] ${args.map(toText).join(' ')}`;
  logBuf.push(line);
  if (logBuf.length > 3000) logBuf.shift();
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) { }
}

// 启动时轮转超大日志
try {
  if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) {
    fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'app.prev.log'));
  }
} catch (e) { }

// 接管 console（之后的调用都会落盘）
for (const k of ['log', 'info', 'warn', 'error']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => { orig(...a); writeLog(k.toUpperCase(), a); };
}
writeLog('INFO', ['===== M记 启动 =====', 'v' + app.getVersion(), 'electron ' + process.versions.electron, process.platform]);

function collectDiagInfo() {
  const s = store.settings || {};
  const winSize = (win && !win.isDestroyed()) ? win.getSize().join('x') : 'n/a';
  const maximized = (win && !win.isDestroyed()) ? win.isMaximized() : false;
  const lines = [
    'M记 诊断报告',
    '生成时间 : ' + new Date().toLocaleString(),
    '程序版本 : ' + app.getVersion(),
    'Electron : ' + process.versions.electron,
    'Chromium : ' + process.versions.chrome,
    'Node     : ' + process.versions.node,
    '操作系统 : ' + process.platform + ' ' + os.release() + ' (' + os.arch() + ')',
    'CPU      : ' + ((os.cpus()[0] || {}).model || 'n/a') + ' × ' + os.cpus().length,
    '内存     : ' + Math.round(os.totalmem() / 1073741824) + ' GB',
    'userData : ' + DATA_DIR,
    '窗口     : ' + winSize + (maximized ? ' (最大化)' : ''),
    '启用源   : ' + ((s.enabledSources || []).join(', ') || '无'),
    '自动连播 : ' + (s.autoPlayNext ? '开' : '关'),
    '收藏/历史: ' + (store.favorites || []).length + ' / ' + (store.history || []).length,
    '已装源   : ' + availableSources().map(x => x.id).join(', '),
    '',
    '===== 配置（不含账号密码） =====',
    JSON.stringify({ settings: s, favorites: (store.favorites || []).slice(0, 20).map(f => ({ id: f.id, name: f.name, sourceId: f.sourceId })) }, null, 2),
    '',
    '===== 运行日志（最近 1500 行） ====='
  ];
  return lines.join('\n');
}

// ---------- 源注册表 ----------
const SOURCE_DEFS = [
  { id: 'xifan', name: '稀饭动漫', type: 'xifan', base: 'https://next.xifanacg.com', api: 'https://api.xifanacg.com', desc: '内置 · 匿名可看' },
  { id: 'jinpai', name: '金牌', file: 'jinpai.js', desc: '内置 · 匿名可看' },
  { id: 'lanerc', name: 'Lanerc 懒站', file: 'lanerc.js', main: true, desc: '官方源 · 需登录' },
  { id: 'bmmdmm', name: '黑猫动漫', type: 'generic', base: 'https://www.bmmdmm.com', api: 'https://www.bmmdmm.com/search?kw={kw}', desc: '内置 · 网页解析' },
  { id: 'mifun', name: '米番', type: 'maccms', base: 'https://ios.mifun.org', api: 'https://ios.mifun.org/index.php/ajax/data?mid=1&ac=list', desc: '内置 · 苹果CMS' },
  { id: 'keke', name: '可可影视', type: 'generic', base: 'https://16.162.205.20:5008', api: 'https://16.162.205.20:5008/search?k={kw}', desc: '内置 · 网页解析' },
  { id: 'cycani', name: '次元城', type: 'cycani', base: 'https://www.cycani.org', api: 'https://www.cycani.org/api', desc: '内置 · 播放需登录' }
];

const CUSTOM_SOURCE_DIR = path.join(DATA_DIR, 'sources');

function readSourceMeta(file, fallbackName) {
  let name = fallbackName;
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 6000);
    const m = head.match(/SOURCE_TITLE\s*=\s*["']([^"']+)["']/) ||
      head.match(/SOURCE_NAME\s*=\s*["']([^"']+)["']/) ||
      head.match(/["']name["']\s*:\s*["']([^"']{1,20})["']/);
    if (m && m[1]) name = m[1].trim();
  } catch (e) { }
  return name;
}

function discoverCustomSources() {
  try {
    if (!fs.existsSync(CUSTOM_SOURCE_DIR)) return [];
    return fs.readdirSync(CUSTOM_SOURCE_DIR)
      .filter(f => f.endsWith('.js'))
      .map(f => {
        const abs = path.join(CUSTOM_SOURCE_DIR, f);
        const base = path.basename(f, '.js');
        return {
          id: 'custom-' + base,
          name: readSourceMeta(abs, base),
          file: f,
          abs,
          custom: true,
          desc: '自定义导入'
        };
      });
  } catch (e) {
    return [];
  }
}

function availableSources() {
  const builtin = SOURCE_DEFS.filter(s => {
    if (s.type === 'xifan' || s.type === 'maccms' || s.type === 'generic' || s.type === 'cycani') return true;
    try { return fs.existsSync(path.join(SOURCE_DIR, s.file)); } catch (e) { return false; }
  }).map(s => Object.assign({}, s, { abs: s.file ? path.join(SOURCE_DIR, s.file) : '', custom: false }));
  const sites = (store.customSites || []).map(x => ({
    id: x.id, name: x.name, type: x.type || 'maccms', base: x.base, api: x.api, custom: true, desc: '网站导入'
  }));
  return builtin.concat(discoverCustomSources()).concat(sites);
}

// ---------- 持久化 ----------
const DEFAULT_STORE = {
  favorites: [],      // [{id, name, pic, sourceId, addedAt}]
  history: [],        // [{id, name, pic, sourceId, episodeIndex, episodeName, position, duration, updatedAt}]
  settings: {
    enabledSources: ['xifan', 'jinpai', 'bmmdmm', 'mifun', 'keke', 'cycani'],
    autoPlayNext: true,
    defaultQuality: 'auto'
  },
  login: {},          // { sourceId: {accessToken, refreshToken, account} }
  health: {},         // { sourceId: {ok, at, error, count} }
  customSites: []     // [{id, name, base, api}] 网站自动识别导入
};
let store = JSON.parse(JSON.stringify(DEFAULT_STORE));

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      store = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STORE)), raw);
      store.settings = Object.assign({}, DEFAULT_STORE.settings, raw.settings || {});
    }
  } catch (e) { console.error('store load fail', e); }
}
function saveStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) { console.error('store save fail', e); }
}

// ---------- worker 池 ----------
class WorkerPool {
  constructor(size, workerFile) {
    this.size = Math.max(1, size);
    this.file = workerFile;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.seq = 0;
    this.pending = new Map(); // reqId -> {resolve, reject}
    this.ready = false;
  }
  spawn() {
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(this.file);
      w.on('message', (m) => this._onMessage(w, m));
      w.on('error', (e) => { console.error('worker error', e); });
      w.on('exit', () => {
        const idx = this.workers.indexOf(w);
        if (idx >= 0) { this.workers.splice(idx, 1); this.idle = this.idle.filter(x => x !== w); }
        if (this.workers.length < this.size && !this.closed) this.spawn();
      });
      this.workers.push(w);
      this.idle.push(w);
    }
    this.ready = true;
  }
  _onMessage(w, m) {
    const p = this.pending.get(m.reqId);
    if (p) {
      this.pending.delete(m.reqId);
      if (m.ok) p.resolve(m);
      else p.reject(Object.assign(new Error(m.error), { logs: m.logs, stack: m.stack }));
    }
    if (!this.idle.includes(w)) this.idle.push(w);
    this._drain();
  }
  _drain() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop();
      const task = this.queue.shift();
      this._send(w, task);
    }
  }
  _send(w, task) {
    const reqId = ++this.seq;
    task.reqId = reqId;
    this.pending.set(reqId, task);
    w.postMessage(Object.assign({ reqId }, task.payload));
  }
  exec(payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const task = { payload, resolve, reject };
      const timer = setTimeout(() => {
        this.pending.delete(task.reqId);
        reject(new Error('源调用超时'));
      }, timeoutMs || 90000);
      const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
      task.resolve = done(resolve);
      task.reject = done(reject);
      if (this.idle.length) { this._send(this.idle.pop(), task); }
      else this.queue.push(task);
    });
  }
  close() { this.closed = true; this.workers.forEach(w => w.terminate()); }
}

let pool = null;

function callSource(sourceId, fn, args, ext) {
  const def = availableSources().find(s => s.id === sourceId);
  if (!def) return Promise.reject(new Error('未知源: ' + sourceId));
  if (def.type === 'maccms') {
    return maccms.call(def, fn, args).then((data) => ({ ok: true, data, logs: ['[maccms] ' + fn] }));
  }
  if (def.type === 'xifan') {
    return xifan.call(def, fn, args).then((data) => ({ ok: true, data, logs: ['[xifan] ' + fn] }));
  }
  if (def.type === 'generic') {
    return generic.call(def, fn, args).then((data) => ({ ok: true, data, logs: ['[generic] ' + fn] }));
  }
  if (def.type === 'cycani') {
    return cycani.call(def, fn, args).then((data) => ({ ok: true, data, logs: ['[cycani] ' + fn] }));
  }
  const file = def.abs || path.join(SOURCE_DIR, def.file);
  if (!fs.existsSync(file)) return Promise.reject(new Error('源文件缺失: ' + def.file));
  const storageDir = path.join(DATA_DIR, 'source-storage');
  try { fs.mkdirSync(storageDir, { recursive: true }); } catch (e) { }
  const storageFile = path.join(storageDir, sourceId + '.json');
  return pool.exec({ id: sourceId, file, fn, args, ext: ext || {}, storageFile })
    .then(r => ({ ok: true, data: r.data, logs: r.logs }));
}

// 播放地址短时缓存（m3u8 auth_key 有时效，缓存 20 分钟）
const playCache = new Map();
const PLAY_TTL = 20 * 60 * 1000;

// ---------- 窗口 ----------
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    backgroundColor: '#0a1216',
    title: 'M记',
    frame: false,               // 无边框：标题栏与控制按钮全部自绘
    roundedCorners: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,        // 允许直接加载各源 CDN 的 m3u8/分片
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // 最大化状态同步给渲染层（切换按钮图标）
  const pushWinState = () => {
    try { if (win && !win.isDestroyed()) win.webContents.send('win:state', { maximized: win.isMaximized() }); } catch (e) { }
  };
  win.on('maximize', pushWinState);
  win.on('unmaximize', pushWinState);

  // 调试：把渲染进程的控制台输出转发到主进程日志
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${String(sourceId).split(/[\\/]/).pop()}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer gone]', JSON.stringify(details));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });

  // 调试钩子：截图 / 真实鼠标点击 / 状态检查
  // LANERC_SHOT=<png>  LANERC_SHOT_JS_FILE=<js>  LANERC_SHOT_JS_WAIT / DELAY
  // LANERC_CLICK="x,y"  LANERC_CLICK_WAIT=<ms>  LANERC_CHECK_JS=<js>
  if (process.env.LANERC_SHOT || process.env.LANERC_CLICK || process.env.LANERC_CHECK_JS) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const jsFile = process.env.LANERC_SHOT_JS_FILE;
          if (jsFile && fs.existsSync(jsFile)) {
            await win.webContents.executeJavaScript(fs.readFileSync(jsFile, 'utf8'), true);
            await new Promise(r => setTimeout(r, Number(process.env.LANERC_SHOT_JS_WAIT || 9000)));
          }
          const click = process.env.LANERC_CLICK;
          if (click) {
            const [cx, cy] = click.split(',').map(Number);
            win.webContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
            await new Promise(r => setTimeout(r, 70));
            win.webContents.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
            await new Promise(r => setTimeout(r, Number(process.env.LANERC_CLICK_WAIT || 2000)));
          }
          const checkFile = process.env.LANERC_CHECK_JS;
          if (checkFile && fs.existsSync(checkFile)) {
            const out = await win.webContents.executeJavaScript(fs.readFileSync(checkFile, 'utf8'), true);
            console.log('[check]', typeof out === 'string' ? out : JSON.stringify(out));
          }
          if (process.env.LANERC_SHOT) {
            const img = await win.webContents.capturePage();
            fs.writeFileSync(process.env.LANERC_SHOT, img.toPNG());
            console.log('[shot] saved to', process.env.LANERC_SHOT);
          }
        } catch (e) { console.error('[shot] fail', e); }
      }, Number(process.env.LANERC_SHOT_DELAY || 7000));
    });
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
}

// 诊断日志
ipcMain.on('log:renderer', (_e, payload) => {
  try { writeLog('R-' + String((payload && payload.level) || 'log').toUpperCase(), [String((payload && payload.msg) || '')]); } catch (e) { }
});
ipcMain.handle('diag:exportQuiet', async () => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = (store.settings && store.settings.logDir) || LOG_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'diag-' + stamp + '.log');
    const content = collectDiagInfo() + '\n' + logBuf.slice(-1500).join('\n') + '\n';
    fs.writeFileSync(file, content, 'utf8');
    writeLog('INFO', ['[feedback] 诊断已导出', file]);
    return { ok: true, path: file };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('dialog:pickDir', async () => {
  if (!win || win.isDestroyed()) return { ok: false };
  const r = await dialog.showOpenDialog(win, {
    title: '选择日志默认导出位置',
    properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths || !r.filePaths.length) return { ok: false, canceled: true };
  // 存进配置，后续导出默认用它
  store.settings = store.settings || {};
  store.settings.logDir = r.filePaths[0];
  saveStore();
  return { ok: true, dir: r.filePaths[0] };
});

ipcMain.handle('diag:export', async () => {
  const content = collectDiagInfo() + '\n' + logBuf.slice(-1500).join('\n') + '\n';
  let filePath = '';
  if (process.env.MICO_DIAG_AUTO) {
    filePath = path.join(DATA_DIR, 'diag-' + stamp() + '.log');
  } else {
    const r = await dialog.showSaveDialog(win, {
      title: '导出诊断日志',
      defaultPath: path.join((store.settings && store.settings.logDir) || app.getPath('downloads'), 'mikufun-diagnose-' + stamp() + '.log'),
      filters: [{ name: '日志文件', extensions: ['log', 'txt'] }]
    });
    if (!r || r.canceled || !r.filePath) return { ok: false, canceled: true };
    filePath = r.filePath;
  }
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    writeLog('INFO', ['[diag] 已导出诊断日志', filePath]);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});
ipcMain.handle('log:open', () => {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); shell.openPath(LOG_DIR); return true; } catch (e) { return false; }
});
// ---------- 账号凭据（本地加密保存，用于自动登录） ----------
const CRED_FILE = path.join(DATA_DIR, 'creds.bin');
const CRED_KEY = require('crypto').createHash('sha256').update('mji-local-credential-2026').digest();

// 多源凭据：{ [sourceId]: { account, password } }，整体 AES-256-GCM 加密
function loadCredsAll() {
  try {
    if (!fs.existsSync(CRED_FILE)) return {};
    const crypto = require('crypto');
    const raw = fs.readFileSync(CRED_FILE);
    if (raw.length < 30) return {};
    const iv = raw.slice(0, 12);
    const tag = raw.slice(12, 28);
    const ct = raw.slice(28);
    const d = crypto.createDecipheriv('aes-256-gcm', CRED_KEY, iv);
    d.setAuthTag(tag);
    const obj = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
    if (!obj || typeof obj !== 'object') return {};
    // 兼容旧格式 { sourceId, account, password }
    if (obj.account && obj.password) {
      const k = obj.sourceId || 'lanerc';
      return { [k]: { account: obj.account, password: obj.password } };
    }
    return obj;
  } catch (e) {
    return {};
  }
}

function writeCredsAll(all) {
  try {
    const crypto = require('crypto');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', CRED_KEY, iv);
    const plain = Buffer.from(JSON.stringify(all), 'utf8');
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CRED_FILE, Buffer.concat([iv, tag, ct]));
    return true;
  } catch (e) {
    writeLog('WARN', ['[auth] 凭据保存失败', String((e && e.message) || e)]);
    return false;
  }
}

function saveCreds(sourceId, account, password) {
  const all = loadCredsAll();
  all[sourceId || 'lanerc'] = { account, password };
  const ok = writeCredsAll(all);
  if (ok) writeLog('INFO', ['[auth] 凭据已保存', sourceId || 'lanerc']);
  return ok;
}

function loadCreds(sourceId) {
  const all = loadCredsAll();
  if (sourceId) return all[sourceId] || null;
  // 不指定时返回第一条（兼容旧调用）
  const keys = Object.keys(all);
  if (!keys.length) return null;
  return Object.assign({ sourceId: keys[0] }, all[keys[0]]);
}

function clearCreds(sourceId) {
  if (!sourceId) {
    try { if (fs.existsSync(CRED_FILE)) fs.unlinkSync(CRED_FILE); } catch (e) { }
    return true;
  }
  const all = loadCredsAll();
  delete all[sourceId];
  return writeCredsAll(all);
}

async function autoLogin() {
  const all = loadCredsAll();
  for (const sourceId of Object.keys(all)) {
    const cred = all[sourceId];
    if (!cred || !cred.account || !cred.password) continue;
    try {
      const r = await callSource(sourceId, 'login', [cred.account, cred.password], {});
      let j = {};
      try { j = JSON.parse((r && r.data) || '{}'); } catch (e) { }
      writeLog('INFO', ['[auth] 自动登录', sourceId, j.ok ? '成功' : ('失败：' + (j.error || ''))]);
    } catch (e) {
      writeLog('WARN', ['[auth] 自动登录异常', sourceId, String((e && e.message) || e)]);
    }
  }
}

// 窗口控制（无边框自绘标题栏）
ipcMain.on('win:min', () => { if (win && !win.isDestroyed()) win.minimize(); });
ipcMain.handle('win:fs-exit', async () => {
  if (win && !win.isDestroyed() && win.isFullScreen()) win.setFullScreen(false);
  return { ok: true };
});

ipcMain.handle('win:fullscreen', async () => {
  if (!win || win.isDestroyed()) return { ok: false };
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  return { ok: true, fullscreen: next };
});

ipcMain.on('win:max', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.on('win:close', () => { if (win && !win.isDestroyed()) win.close(); });
ipcMain.handle('win:isMax', () => (win && !win.isDestroyed()) ? win.isMaximized() : false);
// ---------- IPC ----------
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  sources: availableSources(),
  settings: store.settings,
  userData: DATA_DIR
}));

ipcMain.handle('sources:list', () => availableSources());

ipcMain.handle('src:home', async (_e, { sourceId, ext }) => {
  console.log('[ipc] home <-', sourceId);
  try {
    const r = await callSource(sourceId, 'homeSections', [], ext);
    console.log('[ipc] home ->', sourceId, 'ok=' + r.ok, r.ok ? '' : r.error);
    return r;
  } catch (e) {
    console.error('[ipc] home !!', sourceId, e.message);
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('src:search', async (_e, { sourceId, keyword, page, ext }) => {
  const r = await callSource(sourceId, 'search', [keyword, page || 1], ext).catch(e => ({ ok: false, error: String(e.message || e) }));
  console.log('[ipc] search', sourceId, keyword, 'ok=' + r.ok, r.ok ? '' : r.error);
  return r;
});

// 新番周表（数据源：稀饭动漫 Next 的 /schedule SSR 页面）
function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const req = https.get(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'zh-CN,zh;q=0.9'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchText(res.headers.location, timeoutMs).then(resolve, reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 15000, () => { req.destroy(new Error('请求超时')); });
  });
}

function parseScheduleHtml(html) {
  const out = [];
  const seen = new Set();
  const cardRe = /<a[^>]*href="\/anime\/(\d+)"[^>]*>([\s\S]{0,1800}?)<\/a>/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const id = m[1];
    const inner = m[2];
    const dayM = inner.match(/周([一二三四五六日])(深夜|晚间|凌晨|上午|下午|傍晚|早间)?/);
    const imgM = inner.match(/<img[^>]+src="([^"]+)"/);
    const titleM = inner.match(/title="([^"]+)"/);
    if (!dayM || !titleM) continue;
    const key = id + '|' + dayM[1];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id,
      name: titleM[1].trim(),
      pic: imgM ? imgM[1] : '',
      day: '周' + dayM[1],
      slot: dayM[2] || ''
    });
  }
  return out;
}

ipcMain.handle('schedule:fetch', async () => {
  try {
    const html = await fetchText('https://next.xifanacg.com/schedule', 20000);
    const list = parseScheduleHtml(html);
    writeLog('INFO', ['[schedule] 解析到', list.length, '条']);
    return { ok: true, list, at: Date.now() };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});
// 源导入 / 删除（自定义源存放于 userData/sources）
function saveSourceFile(name, text) {
  const code = String(text || '');
  if (!code || code.length < 200) return { ok: false, error: '源代码太短（至少 200 字符）' };
  try { new Function(code); } catch (e) { return { ok: false, error: '语法错误：' + e.message }; }
  fs.mkdirSync(CUSTOM_SOURCE_DIR, { recursive: true });
  const base = String(name || 'source')
    .replace(/.js$/i, '')
    .replace(/[^\w\u4e00-\u9fa5\-]/g, '')
    .slice(0, 40) || 'source';
  const file = path.join(CUSTOM_SOURCE_DIR, base + '.js');
  fs.writeFileSync(file, code, 'utf8');
  writeLog('INFO', ['[source] 已导入', file]);
  return { ok: true, id: 'custom-' + base, name: readSourceMeta(file, base), file };
}

ipcMain.handle('auth:save', (_e, { sourceId, account, password }) => {
  return { ok: saveCreds(sourceId || 'lanerc', account, password) };
});

ipcMain.handle('auth:has', () => {
  const c = loadCreds();
  return { ok: true, has: !!(c && c.account), account: (c && c.account) || '', sourceId: (c && c.sourceId) || '' };
});

ipcMain.handle('auth:clear', () => {
  try { if (fs.existsSync(CRED_FILE)) fs.unlinkSync(CRED_FILE); return { ok: true }; } catch (e) { return { ok: false }; }
});

// 视频网站自动识别（苹果CMS 接口探测）
ipcMain.handle('site:probe', async (_e, { url }) => {
  try { return await maccms.probe(url); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

ipcMain.handle('site:add', async (_e, { url }) => {
  try {
    // 三个识别器并行跑，取优先级最高的成功结果（maccms > xifan > generic）
    const [m, x, g] = await Promise.all([
      maccms.probe(url).catch(() => null),
      xifan.probe(url).catch(() => null),
      generic.probe(url).catch(() => null)
    ]);
    let r = (m && m.ok) ? m : ((x && x.ok) ? x : ((g && g.ok) ? g : null));
    if (!r) {
      const msg = (g && g.error) || (m && m.error) || '未识别该网站的视频接口';
      return { ok: false, error: msg };
    }
    const id = 'site-' + Buffer.from(r.base).toString('hex').slice(0, 19);
    store.customSites = store.customSites || [];
    if (!store.customSites.some(x => x.id === id)) {
      store.customSites.push({ id, name: r.name, base: r.base, api: r.api, type: r.type || 'maccms', at: Date.now() });
      if (!(store.settings.enabledSources || []).includes(id)) {
        store.settings.enabledSources.push(id);
      }
      saveStore();
      writeLog('INFO', ['[site] 已添加', r.base, r.api]);
    }
    return { ok: true, id, name: r.name, classes: r.classes };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('site:remove', async (_e, { id }) => {
  try {
    store.customSites = (store.customSites || []).filter(x => x.id !== id);
    store.settings.enabledSources = (store.settings.enabledSources || []).filter(x => x !== id);
    saveStore();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('source:import', async (_e, { name, code }) => {
  try { return saveSourceFile(name, code); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

ipcMain.handle('source:importUrl', async (_e, { url, name }) => {
  try {
    if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'URL 无效' };
    const text = await fetchText(String(url), 25000);
    if (!text || text.length < 200) return { ok: false, error: '下载内容为空或不是源脚本' };
    const base = String(name || '') || ((String(url).split('/').pop() || 'source').replace(/\.js$/i, ''));
    return saveSourceFile(base, text);
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('source:delete', async (_e, { id }) => {
  try {
    const def = discoverCustomSources().find(x => x.id === id);
    if (!def) return { ok: false, error: '只能删除自定义导入的源' };
    fs.unlinkSync(def.abs);
    writeLog('INFO', ['[source] 已删除', def.abs]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('src:categories', async (_e, { sourceId }) => {
  return callSource(sourceId, 'categories', [], {}).catch(e => ({ ok: false, error: String((e && e.message) || e) }));
});

ipcMain.handle('src:filtered', async (_e, { sourceId, category, filters, page }) => {
  return callSource(sourceId, 'searchFiltered', [category || '', JSON.stringify(filters || {}), page || 1], {})
    .catch(e => ({ ok: false, error: String((e && e.message) || e) }));
});

// 源健康检查：并发探测每个源能否正常返回搜索结果
async function probeSource(id, keyword) {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      callSource(id, 'search', [keyword || '鬼灭', 1], {}),
      new Promise((_, rej) => setTimeout(() => rej(new Error('超时')), 12000))
    ]).catch(e => ({ ok: false, error: String((e && e.message) || e) }));
    let count = 0, ok = false, error = '';
    if (r && r.ok) {
      try {
        const arr = JSON.parse(r.data);
        count = Array.isArray(arr) ? arr.length : 0;
        ok = count > 0;
        if (!ok) error = '无结果';
      } catch (e) { error = '数据格式异常'; }
    } else {
      error = (r && r.error) || '请求失败';
    }
    return { id, ok, count, ms: Date.now() - t0, error };
  } catch (e) {
    return { id, ok: false, count: 0, ms: Date.now() - t0, error: String((e && e.message) || e) };
  }
}

async function runHealth(ids, keyword) {
  const available = availableSources().map(x => x.id);
  const list = (ids && ids.length ? ids : available).filter(id => available.indexOf(id) >= 0);
  if (!list.length) return [];
  const res = await Promise.all(list.map(id => probeSource(id, keyword)));
  for (const r of res) store.health[r.id] = { ok: r.ok, at: Date.now(), error: r.error, count: r.count };
  saveStore();
  try {
    if (win && !win.isDestroyed()) win.webContents.send('health:update', { health: store.health, results: res });
  } catch (e) { }
  writeLog('INFO', ['[health] 检测完成', res.filter(r => r.ok).length + '/' + res.length, '可用']);
  return res;
}

ipcMain.handle('src:health', async (_e, { ids, keyword }) => runHealth(ids, keyword));

// 启动后自动检测一次启用的源（12 小时内已有结果则跳过）
function scheduleAutoHealth() {
  setTimeout(async () => {
    try {
      const enabled = (store.settings.enabledSources || []).filter(id => availableSources().some(s => s.id === id));
      if (!enabled.length) return;
      const FRESH = 12 * 3600 * 1000;
      const fresh = enabled.every(id => store.health[id] && (Date.now() - store.health[id].at) < FRESH);
      if (fresh) { writeLog('INFO', ['[health] 跳过自动检测（缓存有效）']); return; }
      await runHealth(enabled);
    } catch (e) { writeLog('WARN', ['[health] 自动检测失败', String(e && e.message || e)]); }
  }, 8000);
}
ipcMain.handle('src:detail', async (_e, { sourceId, id, ext }) => {
  return callSource(sourceId, 'detail', [id], ext);
});

ipcMain.handle('src:play', async (_e, { sourceId, flag, ext, cacheKey }) => {
  const key = cacheKey || (sourceId + ':' + JSON.stringify(flag).slice(0, 300));
  const hit = playCache.get(key);
  if (hit && Date.now() - hit.at < PLAY_TTL) return { ok: true, data: hit.data, cached: true };
  const r = await callSource(sourceId, 'play', [flag], ext);
  if (r.ok) playCache.set(key, { data: r.data, at: Date.now() });
  return r;
});

ipcMain.handle('src:login', async (_e, { sourceId, account, password }) => {
  const r = await callSource(sourceId, 'login', [account, password], {});
  if (r.ok) {
    try {
      const p = JSON.parse(r.data);
      if (p.ok) {
        store.login[sourceId] = { account, at: Date.now() };
        saveStore();
      }
    } catch (e) { }
  }
  return r;
});

ipcMain.handle('src:guestCaptcha', async (_e, { sourceId }) => {
  return callSource(sourceId, 'guestCaptcha', [], {});
});

ipcMain.handle('src:guestBind', async (_e, { sourceId, challengeId, selected }) => {
  return callSource(sourceId, 'guestBind', [challengeId, selected], {});
});

// 收藏 / 历史
ipcMain.handle('store:get', () => store);
ipcMain.handle('store:save', (_e, next) => { store = next; saveStore(); return true; });
ipcMain.handle('fav:toggle', (_e, item) => {
  const i = store.favorites.findIndex(f => f.id === item.id && f.sourceId === item.sourceId);
  if (i >= 0) store.favorites.splice(i, 1);
  else store.favorites.unshift(Object.assign({ addedAt: Date.now() }, item));
  saveStore();
  return store.favorites;
});
ipcMain.handle('history:upsert', (_e, item) => {
  const i = store.history.findIndex(h => h.id === item.id && h.sourceId === item.sourceId);
  const rec = Object.assign({}, item, { updatedAt: Date.now() });
  if (i >= 0) store.history.splice(i, 1);
  store.history.unshift(rec);
  if (store.history.length > 300) store.history.length = 300;
  saveStore();
  return true;
});
ipcMain.handle('history:clear', () => { store.history = []; saveStore(); return true; });

// 自定义背景（保存到 userData/bg，返回 file:// URL）
ipcMain.handle('bg:save', (_e, dataUrl) => {
  try {
    const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''));
    if (!m) return { ok: false, error: 'bad data url' };
    let ext = m[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (!/^(png|jpg|webp|gif|bmp)$/.test(ext)) return { ok: false, error: 'unsupported type' };
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 20 * 1024 * 1024) return { ok: false, error: 'too large' };
    const dir = path.join(DATA_DIR, 'bg');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'custom.' + ext);
    fs.writeFileSync(file, buf);
    return { ok: true, url: 'file:///' + encodeURI(file.split(path.sep).join('/')) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});
// 设置
ipcMain.handle('settings:save', (_e, s) => {
  store.settings = Object.assign({}, store.settings, s);
  saveStore();
  return store.settings;
});

// ---------- 生命周期 ----------
// 旧版本目录名（productName 变更前）
const MIGRATE_FROM = 'M记';

function migrateUserData() {
  try {
    const appData = app.getPath('appData');
    const newDir = app.getPath('userData');
    const oldDir = path.join(appData, MIGRATE_FROM);
    if (newDir === oldDir) return;
    if (!fs.existsSync(oldDir)) return;
    if (fs.existsSync(path.join(newDir, 'store.json'))) return; // 已迁移过
    fs.mkdirSync(newDir, { recursive: true });
    // 复制旧目录内容（不覆盖同名的更新文件）
    const copy = (src, dst) => {
      for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const d = path.join(dst, name);
        try {
          const st = fs.statSync(s);
          if (st.isDirectory()) {
            fs.mkdirSync(d, { recursive: true });
            copy(s, d);
          } else if (!fs.existsSync(d)) {
            fs.copyFileSync(s, d);
          }
        } catch (e) { }
      }
    };
    copy(oldDir, newDir);
    writeLog('INFO', ['[migrate] 已从旧目录迁移数据', oldDir, '->', newDir]);
  } catch (e) {
    try { writeLog('WARN', ['[migrate] 迁移失败', String(e && e.message || e)]); } catch (e2) { }
  }
}

app.whenReady().then(() => {
  migrateUserData();
  // 部分源（豆瓣等）的封面有防盗链，按域名补 Referer
  try {
    const { session } = require('electron');
    session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
      const u = details.url;
      if (/doubanio\.com|douban\.com/.test(u)) {
        details.requestHeaders['Referer'] = 'https://movie.douban.com/';
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
      }
      cb({ requestHeaders: details.requestHeaders });
    });
  } catch (e) { console.error('referer hook fail', e); }

  loadStore();
  pool = new WorkerPool(3, path.join(__dirname, 'worker.js'));
  pool.spawn();
  scheduleAutoHealth();
  setTimeout(() => { autoLogin().catch(() => { }); }, 2500);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (pool) pool.close();
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (e) => { console.error('uncaught', e); });
