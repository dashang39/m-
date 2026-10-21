// 苹果CMS（MacCMS v10）通用适配器：自动探测 /list/detail/play
const https = require('https');
const http = require('http');

function fetchText(url, timeoutMs, opts) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(new Error('URL 无效')); }
    const mod = u.protocol === 'http:' ? http : https;
    const insecure = !!(opts && opts.insecure);
    const req = mod.get(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept': 'text/html,application/json,text/plain,*/*',
        'accept-language': 'zh-CN,zh;q=0.9'
      },
      rejectUnauthorized: !insecure
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        fetchText(next, timeoutMs, opts).then(resolve, reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    // 证书链问题时降级重试一次（部分站点证书链不完整，浏览器/curl 能容忍）
    req.on('error', (err) => {
      if (!insecure && /certificate|issuer|CERT_|self.signed/i.test(String(err && err.message))) {
        fetchText(url, timeoutMs, { insecure: true }).then(resolve, reject);
        return;
      }
      reject(err);
    });
    req.setTimeout(timeoutMs || 12000, () => req.destroy(new Error('请求超时')));
  });
}

function normalizeBase(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  s = s.replace(/\/+$/, '');
  return s;
}

/** 常见 MacCMS 采集接口路径 */
function candidateApis(base) {
  const paths = [
    '/api.php/provide/vod/?ac=list',
    '/api.php/provide/vod?ac=list',
    '/api.php/provide/vod/at/json/?ac=list',
    '/api.php/provide/vod/at/xml/?ac=list',
    '/provide/vod/?ac=list',
    '/provide/vod?ac=list',
    '/index.php/api/vod?ac=list',
    '/index.php/ajax/data?mid=1&ac=list',
    '/api/vod?ac=list',
    '/api.php?ac=list',
    '/json.php?ac=list',
    '/api.php/provide/vod/from/maccms/?ac=list'
  ];
  return paths.map((x) => base + x);
}

async function probe(input) {
  const base = normalizeBase(input);
  if (!base) return { ok: false, error: '请输入网址' };

  // 并行探测所有候选接口（每个 4 秒上限），任何一个成功立即采用
  const urls = candidateApis(base);
  // 限并发 3，每个 5 秒；命中即返回，避免拖满全部候选
  let found = null;
  let cursor = 0;
  const worker = async () => {
    while (!found && cursor < urls.length) {
      const u = urls[cursor++];
      try {
        const txt = await fetchText(u, 5000);
        const j = JSON.parse(txt);
        const classes = j && j.class;
        if (j && (Array.isArray(classes) || j.code === 1)) {
          found = {
            ok: true,
            base,
            api: u.replace(/\?ac=list$/, ''),
            name: String((j.name || j.site_name) || new URL(base).hostname).slice(0, 40),
            classes: Array.isArray(classes) ? classes.length : 0
          };
          return;
        }
      } catch (e) { }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (found) return found;

  // 兜底：抓首页找 api.php 线索（限 5 秒）
  try {
    const home = await fetchText(base + '/', 5000);
    const m = home.match(/https?:\/\/[^"'\s]*\/api\.php\/provide\/vod\/?/i) ||
      home.match(/["'](\/api\.php[^"']*)["']/i);
    if (m) {
      let apiUrl = m[0].replace(/^["']|["']$/g, '');
      if (apiUrl.indexOf('//') === 0) apiUrl = 'https:' + apiUrl;
      else if (apiUrl.charAt(0) === '/') apiUrl = base + apiUrl;
      const txt = await fetchText(apiUrl + (apiUrl.indexOf('?') >= 0 ? '&' : '?') + 'ac=list', 4000);
      const j = JSON.parse(txt);
      if (j && (Array.isArray(j.class) || j.code === 1)) {
        return { ok: true, base, api: apiUrl, name: (j.name || new URL(base).hostname), classes: (j.class || []).length };
      }
    }
  } catch (e) { }

  return { ok: false, error: '未识别到可用的视频接口。该站可能需要登录/验证码，或使用专属接口（可改用导入 .js 源脚本）' };
}

function card(v) {
  return {
    id: String(v.vod_id),
    name: String(v.vod_name || ''),
    pic: String(v.vod_pic || ''),
    type: String(v.type_name || ''),
    year: String(v.vod_year || ''),
    remarks: String(v.vod_remarks || ''),
    desc: String(v.vod_blurb || v.vod_content || '').replace(/<[^>]+>/g, '').slice(0, 200)
  };
}

function parsePlayUrl(vod) {
  // 优先第一条播放线路：第01集$http://...#第02集$http://...
  const raw = String(vod.vod_play_url || '');
  const from = String(vod.vod_play_from || '').split('$$$')[0] || '线路1';
  const line = raw.split('$$$')[0] || '';
  const eps = [];
  for (const part of line.split('#')) {
    if (!part) continue;
    const i = part.indexOf('$');
    const name = i >= 0 ? part.slice(0, i) : ('第' + (eps.length + 1) + '集');
    const url = i >= 0 ? part.slice(i + 1) : part;
    if (!url) continue;
    eps.push({
      name: name.trim() || ('第' + (eps.length + 1) + '集'),
      route: from.trim() || '线路1',
      url: JSON.stringify({ vid: url.trim() })
    });
  }
  return eps;
}

function detail(v) {
  return Object.assign(card(v), {
    episodes: parsePlayUrl(v),
    score: String(v.vod_score || '')
  });
}

/**
 * 统一调用入口，与 JS 源接口保持一致
 */
async function call(site, fn, args) {
  const api = site.api || (site.base + '/api.php/provide/vod/');
  const get = (qs) => fetchText(api + '?' + qs, 12000);

  if (fn === 'homeSections') {
    const j = JSON.parse(await get('ac=detail&pg=1'));
    const list = (j.list || []).map(card).filter(x => x.id && x.name);
    return JSON.stringify(list.length ? [{ title: '最新更新', items: list }] : []);
  }

  if (fn === 'search') {
    const kw = encodeURIComponent(String(args[0] || ''));
    const pg = Number(args[1] || 1);
    const j = JSON.parse(await get('ac=detail&wd=' + kw + '&pg=' + pg));
    return JSON.stringify((j.list || []).map(card).filter(x => x.id && x.name));
  }

  if (fn === 'searchFiltered') {
    const cat = encodeURIComponent(String(args[0] || ''));
    const pg = Number(args[2] || 1);
    const j = JSON.parse(await get('ac=detail&t=' + cat + '&pg=' + pg));
    return JSON.stringify((j.list || []).map(card).filter(x => x.id && x.name));
  }

  if (fn === 'categories') {
    const j = JSON.parse(await get('ac=list'));
    const classes = (j.class || []).map(c => ({ key: String(c.type_id), title: c.type_name, name: c.type_name }));
    return JSON.stringify(classes);
  }

  if (fn === 'detail') {
    const id = String(args[0] || '');
    const j = JSON.parse(await get('ac=detail&ids=' + encodeURIComponent(id)));
    const v = (j.list || [])[0];
    if (!v) return JSON.stringify({ id, name: '', episodes: [] });
    return JSON.stringify(detail(v));
  }

  if (fn === 'play') {
    let flag = args[0];
    let obj = {};
    try { obj = JSON.parse(flag); } catch (e) { obj = { vid: String(flag || '') }; }
    const url = obj.vid || obj.url || '';
    if (!url) return JSON.stringify({ url: '', type: 'auto', error: '没有播放地址' });
    const mediaType = (u) => /\.m3u8/i.test(u) ? 'm3u8' : (/\.mp4/i.test(u) ? 'mp4' : 'auto');
    if (/\.(m3u8|mp4|flv)(\?|$)/i.test(url)) {
      return JSON.stringify({ url, type: mediaType(url) });
    }
    // 分享页 / 播放页：从页面里提取 m3u8
    try {
      const html = await fetchText(url, 15000);
      let m = html.match(/(?:https?:)?\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i) ||
        html.match(/["'](\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i);
      let found = m ? m[0] : '';
      if (found) {
        if (found.indexOf('//') === 0) found = 'https:' + found;
        else if (found.charAt(0) === '/') found = new URL(found, url).href;
        if (/^https?:/i.test(found)) return JSON.stringify({ url: found, type: 'm3u8' });
      }
    } catch (e) { /* 忽略 */ }
    return JSON.stringify({ url, type: 'auto', error: '该站的播放地址需要额外解析，可能无法直接播放' });
  }

  throw new Error('该源不支持：' + fn);
}

module.exports = { probe, call, normalizeBase, fetchText };
