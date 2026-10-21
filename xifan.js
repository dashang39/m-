// 稀饭动漫 Next 适配器（Supabase + SSR 页面混合）
const https = require('https');
const { fetchText, normalizeBase } = require('./maccms');

const API_HOST = 'api.xifanacg.com';
const PUB_KEY = 'sb_publishable_OBIVAWACIX6lPXrO98_z24_HcsmalkA';
const SOURCE_ID_MAP = { xfxf1: 4, xfxf2: 5, xfxf3: 6 };

function postJson(path, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request({
      host: API_HOST,
      path,
      method: 'POST',
      headers: {
        'apikey': PUB_KEY,
        'authorization': 'Bearer ' + PUB_KEY,
        'content-type': 'application/json',
        'x-client-info': 'supabase-ssr/0.10.3 createBrowserClient',
        'origin': 'https://next.xifanacg.com',
        'referer': 'https://next.xifanacg.com/',
        'content-length': data.length,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    }, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { out += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 15000, () => req.destroy(new Error('请求超时')));
    req.write(data);
    req.end();
  });
}

async function probe(input) {
  const base = normalizeBase(input);
  if (!base) return { ok: false, error: '请输入网址' };
  let html = '';
  try { html = await fetchText(base, 12000); } catch (e) { return { ok: false, error: '无法访问该网站' }; }
  const isXifan = /xifanacg\.com/i.test(base) || /稀饭动漫/.test(html) || /api\.xifanacg\.com/.test(html);
  if (!isXifan) return { ok: false, error: '不是稀饭动漫站点' };
  // 用搜索接口验证可用性
  try {
    const r = await postJson('/rest/v1/rpc/search_animes', {
      search_term: '鬼灭', page_number: 1, items_per_page: 3, sort_by: 'created_at', sort_order: 'desc'
    });
    if (r.status !== 200) return { ok: false, error: '接口返回 ' + r.status };
    JSON.parse(r.body);
  } catch (e) {
    return { ok: false, error: '接口不可用：' + e.message };
  }
  return { ok: true, type: 'xifan', base, api: 'https://' + API_HOST, name: '稀饭动漫' };
}

function toCard(it) {
  return {
    id: String(it.id),
    name: String(it.title || ''),
    pic: String(it.cover_url || ''),
    type: String(it.genres || it.category || ''),
    year: String(it.year || it.release_year || ''),
    remarks: String(it.status || ''),
    desc: String(it.description || '').replace(/<[^>]+>/g, '').slice(0, 200)
  };
}

function parseEpisodes(html, animeId) {
  const eps = [];
  const seen = new Set();
  const re = new RegExp('/anime/' + animeId + '/play/(\\d+)\\?source=([a-zA-Z0-9]+)', 'g');
  let m;
  while ((m = re.exec(html)) !== null) {
    const epId = m[1];
    const src = m[2];
    const key = epId + '|' + src;
    if (seen.has(key)) continue;
    seen.add(key);
    eps.push({
      name: '第 ' + (eps.length + 1) + ' 集',
      route: src,
      url: JSON.stringify({ episode_id: Number(epId), source: src })
    });
  }
  return eps;
}

async function detail(base, id) {
  const html = await fetchText(base + '/anime/' + id, 15000);
  const h1 = html.match(/<h1[^>]*>([\s\S]{0,160}?)<\/h1>/);
  const og = html.match(/property="og:image" content="([^"]+)"/);
  const desc = html.match(/property="og:description" content="([^"]+)"/) ||
    html.match(/<meta name="description" content="([^"]+)"/);
  const eps = parseEpisodes(html, id);
  return {
    id: String(id),
    name: h1 ? h1[1].replace(/<[^>]+>/g, '').trim() : ('番剧 ' + id),
    pic: og ? og[1] : '',
    desc: desc ? desc[1] : '',
    type: '',
    year: '',
    score: '',
    episodes: eps
  };
}

async function call(site, fn, args) {
  const base = site.base;

  if (fn === 'homeSections') {
    const r = await postJson('/rest/v1/rpc/search_animes', {
      search_term: '', page_number: 1, items_per_page: 20, sort_by: 'created_at', sort_order: 'desc'
    });
    const arr = JSON.parse(r.body);
    return JSON.stringify([{ title: '最近更新', items: (Array.isArray(arr) ? arr : []).map(toCard) }]);
  }

  if (fn === 'search') {
    const kw = String(args[0] || '');
    const pg = Number(args[1] || 1);
    const r = await postJson('/rest/v1/rpc/search_animes', {
      search_term: kw, page_number: pg, items_per_page: 24, sort_by: 'created_at', sort_order: 'desc'
    });
    const arr = JSON.parse(r.body);
    return JSON.stringify((Array.isArray(arr) ? arr : []).map(toCard).filter(x => x.id && x.name));
  }

  if (fn === 'searchFiltered') {
    // 稀饭没有分类接口，退化为按关键词搜索
    const kw = String(args[0] || '');
    const pg = Number(args[2] || 1);
    const r = await postJson('/rest/v1/rpc/search_animes', {
      search_term: kw, page_number: pg, items_per_page: 24, sort_by: 'created_at', sort_order: 'desc'
    });
    const arr = JSON.parse(r.body);
    return JSON.stringify((Array.isArray(arr) ? arr : []).map(toCard).filter(x => x.id && x.name));
  }

  if (fn === 'categories') {
    return JSON.stringify([]);
  }

  if (fn === 'detail') {
    return JSON.stringify(await detail(base, String(args[0] || '')));
  }

  if (fn === 'play') {
    let obj = {};
    try { obj = JSON.parse(args[0]); } catch (e) { obj = {}; }
    const episodeId = Number(obj.episode_id || 0);
    if (!episodeId) return JSON.stringify({ url: '', type: 'auto', error: '缺少剧集信息' });
    const sourceId = SOURCE_ID_MAP[obj.source] || 4;
    const tries = [sourceId, 4, 5, 6].filter((v, i, a) => a.indexOf(v) === i);
    let lastErr = '';
    for (const sid of tries) {
      try {
        const r = await postJson('/functions/v1/issue-web-playback', {
          action: 'fallback', episode_id: episodeId, source_id: sid
        });
        const j = JSON.parse(r.body);
        if (j && j.ok && j.url) {
          const url = String(j.url);
          return JSON.stringify({ url, type: /\.m3u8/i.test(url) ? 'm3u8' : (/\.mp4/i.test(url) ? 'mp4' : 'auto') });
        }
        lastErr = (j && (j.error || j.message)) || ('HTTP ' + r.status);
      } catch (e) {
        lastErr = e.message;
      }
    }
    return JSON.stringify({ url: '', type: 'auto', error: '获取播放地址失败：' + lastErr });
  }

  throw new Error('稀饭动漫不支持：' + fn);
}

module.exports = { probe, call };
