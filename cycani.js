// 次元城动画（cycani.org）适配器
// 接口需要两个头：x-app-name: cyc_web / x-app-version: cycweb
// 播放地址要求登录态，未登录时返回明确提示
const https = require('https');
const { normalizeBase } = require('./maccms');

const HDRS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9',
  'x-app-name': 'cyc_web',
  'x-app-version': 'cycweb',
  'referer': 'https://www.cycani.org/',
  'origin': 'https://www.cycani.org'
};

// 登录态（进程内有效；启动时会用保存的凭据重新登录）
let TOKEN = '';

function apiPostForm(base, path, form, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(base + path); } catch (e) { return reject(new Error('URL 无效')); }
    const body = Object.keys(form)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(form[k]))
      .join('&');
    const headers = Object.assign({}, HDRS, {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(body)
    });
    if (TOKEN) headers['authorization'] = TOKEN;
    const req = https.request({
      host: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, method: 'POST',
      headers, rejectUnauthorized: false,
      timeout: timeoutMs || 12000
    }, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('返回非 JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 12000, () => req.destroy(new Error('请求超时')));
    req.write(body);
    req.end();
  });
}

function apiGetAuthed(base, path, timeoutMs) {
  // 带登录态的 GET：用 form 版本的 headers 构造
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(base + path); } catch (e) { return reject(new Error('URL 无效')); }
    const headers = Object.assign({}, HDRS);
    if (TOKEN) headers['authorization'] = TOKEN;
    const req = https.request({
      host: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, method: 'GET',
      headers, rejectUnauthorized: false,
      timeout: timeoutMs || 12000
    }, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('返回非 JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 12000, () => req.destroy(new Error('请求超时')));
    req.end();
  });
}

function apiGet(base, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(base + path); } catch (e) { return reject(new Error('URL 无效')); }
    const req = https.request({
      host: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, method: 'GET',
      headers: HDRS, rejectUnauthorized: false,
      timeout: timeoutMs || 12000
    }, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('返回非 JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 12000, () => req.destroy(new Error('请求超时')));
    req.end();
  });
}

function card(v) {
  return {
    id: String(v.video_id || v.id || ''),
    name: String(v.title || ''),
    pic: String(v.cover_url || ''),
    type: String((v.tags || []).slice(0, 2).join(' ') || v.version || ''),
    year: String(v.year || ''),
    remarks: String(v.remarks || ''),
    desc: String(v.description || '').split('[简介原文]')[0].replace(/\s+/g, ' ').trim().slice(0, 200)
  };
}

async function probe(input) {
  const base = normalizeBase(input);
  if (!base) return { ok: false, error: '请输入网址' };
  if (!/cycani\.(org|com)|cycapp/i.test(base)) {
    return { ok: false, error: '不是次元城站点' };
  }
  try {
    const j = await apiGet(base, '/api/index/recommend', 9000);
    if (j && j.code === 0) {
      return { ok: true, type: 'cycani', base, api: base + '/api', name: '次元城动画' };
    }
    return { ok: false, error: '接口返回异常：' + ((j && j.msg) || '') };
  } catch (e) {
    return { ok: false, error: '接口不可用：' + e.message };
  }
}

async function call(site, fn, args) {
  const base = site.base;

  if (fn === 'login') {
    const username = String(args[0] || '').trim();
    const password = String(args[1] || '');
    if (!username || !password) return JSON.stringify({ ok: false, error: '请填写账号和密码' });
    const j = await apiPostForm(base, '/api/auth/login', { Username: username, Password: password });
    if (!j || j.code !== 0) {
      return JSON.stringify({ ok: false, error: (j && j.msg) || '账号或密码错误' });
    }
    TOKEN = (j.data && j.data.token) || '';
    return JSON.stringify({ ok: true, user: (j.data && j.data.user) || null });
  }

  if (fn === 'homeSections') {
    const j = await apiGet(base, '/api/index/recommend');
    const groups = (j.data && j.data.list) || [];
    const sections = [];
    for (const g of groups) {
      const items = (g.videos || []).map(card).filter(x => x.id && x.name);
      if (items.length) sections.push({ title: g.name || '推荐', items });
    }
    return JSON.stringify(sections);
  }

  if (fn === 'search') {
    const kw = encodeURIComponent(String(args[0] || ''));
    const pg = Number(args[1] || 1);
    const j = await apiGet(base, '/api/videos/search?q=' + kw + '&page=' + pg + '&page_size=24');
    const list = (j.data && j.data.list) || [];
    return JSON.stringify(list.map(card).filter(x => x.id && x.name));
  }

  if (fn === 'categories') {
    const j = await apiGet(base, '/api/ranks').catch(() => null);
    const list = (j && j.data && j.data.list) || [];
    return JSON.stringify(list.map(r => ({ key: String(r.id), title: r.name, name: r.name })));
  }

  if (fn === 'detail') {
    const id = String(args[0] || '');
    const j = await apiGet(base, '/api/videos/' + encodeURIComponent(id));
    const d = (j && j.data) || {};
    // 剧集列表：用第一条播放线路
    const playFrom = (d.play_from && d.play_from[0]) || { code: 'cychub' };
    let eps = [];
    try {
      const sec = await apiGet(base, '/api/videos/' + encodeURIComponent(id) +
        '/sections?player_code=' + encodeURIComponent(playFrom.code) + '&page=1&page_size=48');
      const list = (sec && sec.data && sec.data.list) || [];
      eps = list.map((s, i) => ({
        name: String(s.title || ('第' + (i + 1) + '集')),
        route: playFrom.title || '线路1',
        url: JSON.stringify({ section_id: s.id, player_code: playFrom.code })
      }));
    } catch (e) { }
    return JSON.stringify({
      id,
      name: String(d.title || ''),
      pic: String(d.cover_url || ''),
      desc: String(d.description || '').split('[简介原文]')[0].replace(/\s+/g, ' ').trim().slice(0, 300),
      type: (d.tags || []).slice(0, 3).join(' '),
      year: String(d.year || ''),
      score: d.score ? String(d.score) : '',
      episodes: eps
    });
  }

  if (fn === 'play') {
    let obj = {};
    try { obj = JSON.parse(args[0]); } catch (e) { }
    if (!obj.section_id) return JSON.stringify({ url: '', type: 'auto', error: '缺少剧集信息' });
    if (!TOKEN) {
      return JSON.stringify({
        url: '', type: 'auto', needLogin: true,
        error: '次元城的播放地址要求登录后获取，请先登录次元城账号'
      });
    }
    // 已登录：官方接口 /api/v2/sections/{id}/play-url
    const sid = encodeURIComponent(obj.section_id);
    try {
      const j = await apiGetAuthed(base, '/api/v2/sections/' + sid + '/play-url');
      if (j && j.code === 0 && j.data && j.data.url) {
        const url = String(j.data.url);
        return JSON.stringify({
          url,
          type: /\.m3u8/i.test(url) ? 'm3u8' : (/\.mp4/i.test(url) ? 'mp4' : 'auto'),
          headers: { referer: 'https://www.cycani.org/', origin: 'https://www.cycani.org' }
        });
      }
      return JSON.stringify({ url: '', type: 'auto', error: (j && j.msg) || '未取到播放地址' });
    } catch (e) {
      return JSON.stringify({ url: '', type: 'auto', error: '取播放地址失败：' + e.message });
    }
  }

  throw new Error('次元城不支持：' + fn);
}

module.exports = { probe, call };
