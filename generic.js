// 通用 HTML 站适配器：启发式识别搜索入口、详情页、播放直链
const { fetchText, normalizeBase } = require('./maccms');

function absUrl(base, href) {
  try { return new URL(href, base).href; } catch (e) { return href; }
}

function uniq(arr) { return Array.from(new Set(arr)); }

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** 从首页 HTML 里推断站点结构 */
function analyze(html, base) {
  const host = (() => { try { return new URL(base).hostname; } catch (e) { return base; } })();

  // 1) 搜索入口：优先 form，其次常见路径
  let searchTpl = '';
  const formRe = /<form[^>]*action=["']([^"']+)["'][^>]*>([\s\S]{0,600}?)<\/form>/gi;
  let fm;
  while ((fm = formRe.exec(html)) !== null) {
    const action = fm[1];
    const inner = fm[2];
    const nameM = inner.match(/name=["'](kw|wd|q|keyword|searchword|k|s|word)["']/i);
    if (nameM) {
      const act = action || base + '/';
      searchTpl = absUrl(base, act) + (act.indexOf('?') >= 0 ? '&' : '?') + nameM[1] + '={kw}';
      break;
    }
  }
  if (!searchTpl) {
    const candidates = ['/search?wd={kw}', '/search?q={kw}', '/vodsearch/{kw}----------1---.html',
      '/index.php/vod/search.html?wd={kw}', '/search/{kw}', '/?s={kw}'];
    for (const c of candidates) searchTpl = searchTpl || '';
    searchTpl = absUrl(base, '/search?wd={kw}');
  }

  // 2) 详情链接模式：取出现最多的 /xxx/{数字} 形态
  const hrefs = [];
  const aRe = /href=["']([^"'#]+)["']/gi;
  let am;
  while ((am = aRe.exec(html)) !== null) hrefs.push(am[1]);
  const patterns = {};
  for (const h of hrefs) {
    const m = h.match(/^(\/[a-zA-Z0-9_\-]{2,20}\/)(\d+)([^\/]{0,12})$/);
    if (m) patterns[m[1]] = (patterns[m[1]] || 0) + 1;
  }
  let detailPrefix = '';
  let best = 0;
  for (const k of Object.keys(patterns)) {
    if (patterns[k] > best) { best = patterns[k]; detailPrefix = k; }
  }

  return { host, searchTpl, detailPrefix, sample: best };
}

/** 从列表页 HTML 提取条目 */
function parseList(html, base, detailPrefix) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = absUrl(base, m[1]);
    const inner = m[2];
    const imgM = inner.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
    const titleM = inner.match(/title=["']([^"']+)["']/i) || inner.match(/alt=["']([^"']+)["']/i);
    let name = titleM ? titleM[1] : stripTags(inner);
    if (!name || name.length < 2 || name.length > 60) continue;
    const isDetail = detailPrefix ? href.indexOf(detailPrefix) >= 0 : /\/(anime|vod|detail|video)\//.test(href);
    if (!isDetail) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({
      id: href,
      name,
      pic: imgM ? absUrl(base, imgM[1]) : '',
      type: '',
      year: '',
      remarks: '',
      desc: ''
    });
  }
  return out.slice(0, 40);
}

async function probe(input) {
  const base = normalizeBase(input);
  if (!base) return { ok: false, error: '请输入网址' };
  let html = '';
  try { html = await fetchText(base, 12000); } catch (e) { return { ok: false, error: '无法访问该网站' }; }
  if (!html || html.length < 500) return { ok: false, error: '页面内容为空' };
  const info = analyze(html, base);
  const hasDetailLink = /href=["'][^"']*\/(anime|vod|detail|video|movie|play)\//i.test(html);
  if (!info.detailPrefix && !hasDetailLink) {
    return { ok: false, error: '未能识别详情页结构（可能是纯 JS 渲染站点，需要专门的源脚本）' };
  }
  return {
    ok: true,
    type: 'generic',
    base,
    api: info.searchTpl,
    name: info.host,
    classes: 0,
    tip: '通用解析：仅提取页面里可见的番剧与播放直链'
  };
}

async function call(site, fn, args) {
  const base = site.base;
  const searchTpl = site.api || (base + '/search?wd={kw}');

  if (fn === 'homeSections') {
    const html = await fetchText(base, 15000);
    const info = analyze(html, base);
    const items = parseList(html, base, info.detailPrefix);
    return JSON.stringify(items.length ? [{ title: '首页', items }] : []);
  }

  if (fn === 'search') {
    const kw = encodeURIComponent(String(args[0] || ''));
    const url = searchTpl.replace('{kw}', kw);
    const html = await fetchText(url, 15000);
    const info = analyze(html, base);
    return JSON.stringify(parseList(html, base, info.detailPrefix));
  }

  if (fn === 'categories') return JSON.stringify([]);

  if (fn === 'detail') {
    let id = String(args[0] || '');
    const url = /^https?:/i.test(id) ? id : absUrl(base, id);
    const html = await fetchText(url, 15000);
    const h1 = html.match(/<h1[^>]*>([\s\S]{0,160}?)<\/h1>/) || html.match(/<title>([^<]{1,80})<\/title>/);
    const og = html.match(/property=["']og:image["'] content=["']([^"']+)["']/i);
    const desc = html.match(/property=["']og:description["'] content=["']([^"']+)["']/i) || html.match(/name=["']description["'] content=["']([^"']+)["']/i);

    // 剧集：详情页里指向 play / 播放器的链接
    const eps = [];
    const seen = new Set();
    const epRe = /<a[^>]+href=["']([^"']*(?:play|watch|player|vodplay)[^"']*)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
    let m;
    while ((m = epRe.exec(html)) !== null) {
      const href = absUrl(base, m[1]);
      if (seen.has(href)) continue;
      seen.add(href);
      const name = stripTags(m[2]) || ('第 ' + (eps.length + 1) + ' 集');
      eps.push({ name: name.slice(0, 20), route: '线路1', url: JSON.stringify({ page: href }) });
    }
    // 兜底：页面里直接有 m3u8
    if (!eps.length) {
      const m3 = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
      if (m3) eps.push({ name: '正片', route: '线路1', url: JSON.stringify({ vid: m3[0] }) });
    }
    return JSON.stringify({
      id,
      name: h1 ? stripTags(h1[1]) : (site.name || '未知'),
      pic: og ? og[1] : '',
      desc: desc ? desc[1] : '',
      type: '',
      year: '',
      score: '',
      episodes: eps
    });
  }

  if (fn === 'play') {
    let obj = {};
    try { obj = JSON.parse(args[0]); } catch (e) { obj = { vid: String(args[0] || '') }; }
    const direct = obj.vid || '';
    if (direct && /\.(m3u8|mp4|flv)(\?|$)/i.test(direct)) {
      return JSON.stringify({ url: direct, type: /\.m3u8/i.test(direct) ? 'm3u8' : 'mp4' });
    }
    const page = obj.page || '';
    if (!page) return JSON.stringify({ url: '', type: 'auto', error: '没有可用的播放页' });
    const html = await fetchText(page, 15000);
    let m = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i) ||
      html.match(/["'](\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i) ||
      html.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/i);
    let found = m ? m[0] : '';
    if (found) {
      if (found.charAt(0) === '/') found = absUrl(page, found);
      return JSON.stringify({ url: found, type: /\.m3u8/i.test(found) ? 'm3u8' : 'mp4' });
    }
    return JSON.stringify({ url: '', type: 'auto', error: '该页未找到可直接播放的地址（可能需要解析接口）' });
  }

  throw new Error('通用源不支持：' + fn);
}

module.exports = { probe, call };
