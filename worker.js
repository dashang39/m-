// 源宿主 worker：在独立线程里执行 JS 源插件，避免阻塞 UI
const { parentPort } = require('worker_threads');
const { loadSource } = require('./host.js');
const fs = require('fs');

// id -> { api, mtime }  mtime 用于检测存储文件变化后自动重载
const loaded = new Map();

function statMtime(file) {
  try { return file ? fs.statSync(file).mtimeMs : 0; } catch (e) { return 0; }
}

function getApi(id, file, ext, storageFile) {
  const rec = loaded.get(id);
  const mtime = statMtime(storageFile);
  if (rec && rec.mtime === mtime) return rec.api;
  const api = loadSource(file, { ext: ext || {}, storageFile: storageFile || null });
  loaded.set(id, { api, mtime });
  return api;
}

parentPort.on('message', (msg) => {
  const { reqId, id, file, fn, args, ext, storageFile } = msg;
  if (msg.type === 'reset') {
    loaded.clear();
    parentPort.postMessage({ reqId, ok: true, data: null });
    return;
  }
  try {
    const api = getApi(id, file, ext, storageFile);
    const out = api.call(fn, ...(args || []));
    parentPort.postMessage({ reqId, ok: true, data: out, logs: api.logs.slice(-20) });
  } catch (e) {
    parentPort.postMessage({
      reqId, ok: false,
      error: String((e && e.message) || e),
      stack: String((e && e.stack) || '').slice(0, 800),
      logs: (loaded.get(id) ? loaded.get(id).api.logs.slice(-20) : [])
    });
  }
});
