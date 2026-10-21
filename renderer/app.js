/* M记 - 渲染进程 */
'use strict';

const API = window.lanerc;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/* ---------------- 渲染层日志上报（供诊断导出） ---------------- */
(function hookRendererLogs() {
  const fmt = (a) => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a); } catch (e) { return String(a); } }
    return String(a);
  };
  const send = (level, msg) => { try { if (API && API.logToMain) API.logToMain(level, msg); } catch (e) { } };
  ['error', 'warn'].forEach((k) => {
    const orig = console[k].bind(console);
    console[k] = (...a) => { orig(...a); send(k.toUpperCase(), a.map(fmt).join(' ')); };
  });
  window.addEventListener('error', (e) => {
    send('ERROR', `window.onerror ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    send('ERROR', 'unhandledrejection ' + fmt(e.reason));
  });
})();

const state = {
  sources: [],            // [{id,name,file,main,desc}]
  enabled: [],            // 启用源 id
  settings: {},
  store: { favorites: [], history: [] },
  route: 'home',
  sourceId: 'lanerc',
  detail: null,           // {sourceId, id, data}
  searchQuery: '',
  results: [],
  epIndex: 0,
  player: null,           // hls instance
  currentKey: null,
  hideTimer: null,
  pendingPlay: null,      // {sourceId, flag, epIndex}
  homeSeq: 0,
  homePending: null,             // 首页渲染代际，用于丢弃过期响应
  discover: {
    sourceId: '', categories: [], category: '', filters: {},
    page: 1, items: [], loading: false, tab: 'browse', inited: false
  },
  schedule: { list: [], day: '', at: 0, loading: false },
  health: {}
};

const SOURCE_BADGE = { lanerc: 'LANERC', gugu: '柚子', guazi: '瓜子', yulu: '雨露', akianime: 'Aki', sx: '师兄', jinpai: '金牌', manguo: '追剧', nmeng: '柠檬', sd: '闪电', xfy: '风车', yzx: '云资源', zhg: '漫时光', ain: 'cain', ani: 'Anich', kumanxing: '酷漫', dmbus: '弹幕', lmm85: 'LMM', '07': '零七', '23': '23' };

/* ---------------- 工具 ---------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function parseJSON(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}
function cleanPic(url) {
  if (!url) return '';
  let s = String(url).trim();
  // 源脚本给豆瓣图附加了 @Referer=... 元信息，取真实 URL
  const i = s.indexOf('@Referer=');
  if (i > 0) s = s.slice(0, i);
  if (s.indexOf('//') === 0) s = 'https:' + s;
  return s;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function toast(msg, ms, type) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast-show' + (type ? ' toast-' + type : '');
  // 强制重排以便重复触发动画
  void t.offsetWidth;
  t.classList.add('toast-in');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove('toast-in');
    t.classList.add('toast-out');
  }, ms || 2400);
}
function sourceName(id) {
  const s = state.sources.find(x => x.id === id);
  return s ? s.name : (SOURCE_BADGE[id] || id);
}
function isFav(item) {
  return state.store.favorites.some(f => f.id === item.id && f.sourceId === item.sourceId);
}

/* ---------------- 海报卡 ---------------- */
function cardHTML(item, sourceId, showSource) {
  const pic = cleanPic(item.pic);
  const badge = item.remarks ? `<span class="badge">${esc(item.remarks)}</span>` : '';
  const srcBadge = showSource ? `<span class="badge src">${esc(SOURCE_BADGE[sourceId] || sourceId)}</span>` : '';
  return `<div class="card" data-id="${esc(item.id)}" data-src="${esc(sourceId)}">
    <div class="poster">
      <div class="ph">封面</div>
      ${pic ? `<img loading="lazy" src="${esc(pic)}" alt="" >` : ''}
      ${badge}${srcBadge}
    </div>
    <div class="cname">${esc(item.name)}</div>
    <div class="cmeta">${esc(item.year || item.type || '')}</div>
  </div>`;
}

function skeletonRow(n) {
  return `<div class="row-scroll">${Array.from({ length: n || 8 }, () => `<div class="skel skel-card"></div>`).join('')}</div>`;
}

/* ---------------- 横幅卡（首页横滑） ---------------- */
function bannerCardHTML(item, sourceId, big) {
  const pic = cleanPic(item.pic);
  const badge = item.remarks ? `<span class="badge">${esc(item.remarks)}</span>` : '';
  const meta = [item.year, item.type, item.remarks].filter(Boolean).join(' · ');
  return `<div class="card bcard${big ? ' big' : ''}" data-id="${esc(item.id)}" data-src="${esc(sourceId)}">
    <div class="bposter">
      <div class="ph">封面</div>
      ${pic ? `<img loading="lazy" src="${esc(pic)}" alt="">` : ''}
      <div class="bshade"></div>
      ${badge}
      <div class="binfo">
        <div class="bname">${esc(item.name)}</div>
        ${meta ? `<div class="bmeta">${esc(meta)}</div>` : ''}
      </div>
    </div>
  </div>`;
}

/**
 * 横幅行：条目少（≤4）时按整行均分铺满，不留右侧空白；
 * 条目多时固定宽度横向滚动。
 */
function bannerRowHTML(items, sourceId, big) {
  const list = items.slice(0, 24);
  const n = list.length;
  const fill = n <= 4;
  const style = fill ? ` style="grid-template-columns: repeat(${n}, minmax(0, 1fr));"` : '';
  return `<div class="brow${big ? ' big' : ''}${fill ? ' fill' : ''}"${style}>${list.map(it => bannerCardHTML(it, sourceId, big)).join('')}</div>`;
}
function skeletonGrid(n) {
  return `<div class="grid">${Array.from({ length: n || 12 }, () => `<div class="skel skel-card"></div>`).join('')}</div>`;
}

/* ---------------- 导航 ---------------- */
function setNav(route) {
  state.route = route;
  const tb = $('#topBack');
  if (tb) tb.classList.toggle('hidden', route !== '');
  $$('.rail-btn[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === route));
  const titles = { home: '首页', search: '搜索', discover: '发现', schedule: '新番周表', fav: '我的收藏', history: '观看历史' };
  $('#titleBar').textContent = titles[route] || 'Lanerc PC';
  if (route !== 'search') $('#q').value = state.searchQuery || '';
}

function go(route) {
  setNav(route);
  $('#view').scrollTop = 0;
  if (route === 'home') renderHome();
  else if (route === 'search') renderSearchPage();
  else if (route === 'discover') renderDiscover();
  else if (route === 'schedule') renderSchedule();
  else if (route === 'fav') renderFavorites();
  else if (route === 'history') renderHistory();
}

/* ---------------- 首页 ---------------- */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error((label || '请求') + '超时')), ms))
  ]);
}

async function renderHome() {
  // 并发去重：短时间内被多处触发时只发起一轮请求
  if (state.homePending) return state.homePending;
  state.homePending = renderHomeOnce().finally(() => { state.homePending = null; });
  return state.homePending;
}

async function renderHomeOnce() {
  const seq = ++state.homeSeq;
  const view = $('#view');
  view.innerHTML = `<div class="chips" id="srcChips"></div><div id="homeBody">${skeletonRow(8)}</div>`;
  renderSourceChips();

  const body = $('#homeBody');
  const targets = state.enabled.filter(id => {
    if (!state.sources.some(s => s.id === id)) return false;
    const h = state.health[id];
    return !(h && h.ok === false);
  });
  const deadIds = state.enabled.filter(id => state.health[id] && state.health[id].ok === false);
  if (!targets.length) {
    body.innerHTML = `<div class="empty"><div class="big">📺</div><div>还没有启用任何内容源</div><button class="btn btn-ghost" data-action="settings">去设置</button></div>`;
    return;
  }

  let rendered = 0;
  const warnings = [];
  // 每次写入都实时取节点：切源/重渲染时旧节点会被替换，闭包里的 body 可能已脱离 DOM
  const liveBody = () => document.getElementById('homeBody');
  const addSection = (html) => {
    if (seq !== state.homeSeq) return;
    const host = liveBody();
    if (!host) return;
    if (rendered === 0) host.innerHTML = '';
    host.insertAdjacentHTML('beforeend', html);
    rendered++;
  };
  const addWarn = (text) => {
    if (seq !== state.homeSeq) return;
    warnings.push(text);
    const host = liveBody();
    if (!host) return;
    let el = document.getElementById('homeWarn');
    if (!el) {
      host.insertAdjacentHTML('beforeend', '<div id="homeWarn" class="home-warn"></div>');
      el = document.getElementById('homeWarn');
    }
    if (el) el.textContent = warnings.join(' · ');
  };

  await Promise.all(targets.map(async (sid) => {
    try {
      const r = await withTimeout(API.home(sid, {}), 8000, sourceName(sid));
      if (!r || !r.ok) { addWarn(`${sourceName(sid)} 不可用`); return; }
      const sections = parseJSON(r.data, []);
      if (!Array.isArray(sections) || !sections.length) { addWarn(`${sourceName(sid)} 无数据`); return; }
      let added = 0;
      for (const sec of sections) {
        const items = (sec.items || []).filter(x => x && x.id && x.name);
        if (!items.length) continue;
        const title = String(sec.title || '推荐');
        // 轮播 / 热门 用横幅流，其余栏目保持竖版海报
        const useBanner = rendered === 0 || /轮播|热门/.test(title);
        const rowHtml = useBanner
          ? bannerRowHTML(items, sid, rendered === 0)
          : `<div class="row-scroll">${items.slice(0, 20).map(it => cardHTML(it, sid, false)).join('')}</div>`;
        addSection(`
          <section class="section">
            <div class="section-head"><h2>${esc(sourceName(sid))} · ${esc(title)}</h2></div>
            ${rowHtml}
          </section>`);
        added++;
      }
      if (!added) addWarn(`${sourceName(sid)} 无数据`);
    } catch (e) {
      addWarn(`${sourceName(sid)} ${String(e.message || e).slice(0, 12)}`);
    }
  }));


  if (seq !== state.homeSeq) return;
  if (!state._homeShown) { state._homeShown = true; document.getElementById('view').scrollTop = 0; }
  if (!rendered) {
    body.innerHTML = `<div class="empty"><div class="big">📡</div><div>源暂时没有返回内容<br><span style="font-size:12px;opacity:.7">可以试试搜索，或在设置里启用更多源</span></div></div>`;
  }
}

function renderSourceChips() {
  const el = $('#srcChips');
  if (!el) return;
  el.innerHTML = state.sources.map(s => {
    const h = state.health[s.id];
    const dead = h && h.ok === false;
    const cls = [state.enabled.includes(s.id) ? 'active' : '', dead ? 'dead' : ''].filter(Boolean).join(' ');
    const tip = dead ? '检测不可用：' + (h.error || '无结果') : '';
    return '<button class="chip ' + cls + '" data-chip-src="' + esc(s.id) + '" title="' + esc(tip) + '">' + esc(s.name) + (dead ? ' ⚠' : '') + '</button>';
  }).join('') + `<button class="chip" data-action="sources">＋ 管理源</button>`;
}

/* ---------------- 发现：标签检索 / 新番 ---------------- */
function currentDiscoverSource() {
  const d = state.discover;
  if (d.sourceId && state.enabled.includes(d.sourceId)) return d.sourceId;
  return state.enabled[0] || '';
}

function filterLabel(key) {
  return key === 'class' ? '类型' : key === 'year' ? '年份' : key === 'sort' ? '排序' : key;
}

function renderDiscoverShell() {
  const d = state.discover;
  const view = $('#view');
  const cats = (d.categories || []).filter(Boolean);
  const cur = cats.find(c => c.key === d.category) || {};
  const filters = (cur.filters || []).filter(f => f && Array.isArray(f.value) && f.value.length);
  const curSrc = currentDiscoverSource();
  const srcChips = state.enabled
    .map(id => state.sources.find(x => x.id === id))
    .filter(Boolean)
    .map(x => '<button class="chip ' + (x.id === curSrc ? 'active' : '') + '" data-dvsrc="' + esc(x.id) + '">' +
      esc(x.name) + '</button>').join('');
  view.innerHTML = `
    <div class="dv-srcbar">
      <span class="dv-srclabel">内容源</span>
      <div class="dv-srclist" id="dvSources">${srcChips}</div>
    </div>
    <div class="dv-tabs">
      <button class="chip ${d.tab === 'browse' ? 'active' : ''}" data-dvtab="browse">分类浏览</button>
      <button class="chip ${d.tab === 'new' ? 'active' : ''}" data-dvtab="new">新番更新</button>
    </div>
    <div class="chips" id="dvCats">${cats.map(c => `<button class="chip ${c.key === d.category ? 'active' : ''}" data-dvcat="${esc(c.key)}">${esc(c.title || c.name)}</button>`).join('')}</div>
    <div id="dvFilters">${filters.map(f => `
      <div class="filter-row">
        <span class="flabel">${esc(filterLabel(f.key))}</span>
        <div class="fopts">${(f.value || []).slice(0, 20).map(o => {
    const v = (o && typeof o === 'object') ? (o.v != null ? o.v : o.value) : o;
    const n = (o && typeof o === 'object') ? (o.n || o.name || o.v) : o;
    const on = String(d.filters[f.key] || '') === String(v || '');
    return `<button class="fopt ${on ? 'on' : ''}" data-fkey="${esc(f.key)}" data-fval="${esc(v || '')}">${esc(n)}</button>`;
  }).join('')}</div>
      </div>`).join('')}</div>
    <div class="section-head" style="margin:22px 26px 12px">
      <h2>${d.tab === 'new' ? '新番更新' : esc(cur.title || cur.name || '全部')}</h2>
      <span class="more" id="dvCount"></span>
    </div>
    <div class="grid" id="dvGrid"></div>
    <div style="display:flex;justify-content:center;margin:6px 0 34px">
      <button class="btn btn-ghost" id="dvMore" style="display:none">加载更多</button>
    </div>`;

  const srcEl = $('#dvSources');
  if (srcEl) srcEl.onclick = async (e) => {
    const b = e.target.closest('[data-dvsrc]');
    if (!b) return;
    const id = b.dataset.dvsrc;
    if (id === state.discover.sourceId) return;
    state.discover.sourceId = id;
    state.discover.categories = [];
    state.discover.category = '';
    state.discover.filters = {};
    state.discover.items = [];
    await renderDiscover();
  };

  const catsEl = $('#dvCats');
  if (catsEl) catsEl.onclick = (e) => {
    const b = e.target.closest('[data-dvcat]');
    if (!b) return;
    state.discover.category = b.dataset.dvcat;
    state.discover.filters = {};
    state.discover.tab = 'browse';
    renderDiscoverShell();
    loadDiscoverPage(true);
  };
  const fEl = $('#dvFilters');
  if (fEl) fEl.onclick = (e) => {
    const b = e.target.closest('[data-fkey]');
    if (!b) return;
    state.discover.filters[b.dataset.fkey] = b.dataset.fval;
    renderDiscoverShell();
    loadDiscoverPage(true);
  };
  $$('[data-dvtab]').forEach(btn => { btn.onclick = () => setDiscoverTab(btn.dataset.dvtab); });
  const more = $('#dvMore');
  if (more) more.onclick = () => loadDiscoverPage(false);
}

async function loadDiscoverPage(reset) {
  const d = state.discover;
  const grid = $('#dvGrid');
  if (!grid || d.loading) return;
  const src = currentDiscoverSource();
  if (!src) return;
  d.loading = true;
  if (reset) {
    d.page = 1;
    d.items = [];
    grid.innerHTML = Array.from({ length: 12 }, () => '<div class="skel skel-card"></div>').join('');
  }
  let r = null;
  try {
    r = await withTimeout(API.filtered(src, d.category, d.filters, d.page), 15000, '分类');
  } catch (e) { r = { ok: false, error: String(e.message || e) }; }
  d.loading = false;
  if (!grid.isConnected) return;
  const list = parseJSON(r && r.data, []);
  const items = Array.isArray(list) ? list : [];
  if (reset) grid.innerHTML = '';
  if (!items.length) {
    if (reset) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🍃</div><div>没有符合条件的番剧<br><span style="font-size:12px;opacity:.7">换个标签，或切到其他源</span></div></div>`;
    }
    const m0 = $('#dvMore'); if (m0) m0.style.display = 'none';
    return;
  }
  d.items = d.items.concat(items);
  grid.insertAdjacentHTML('beforeend', items.map(it => cardHTML(it, src, false)).join(''));
  const cnt = $('#dvCount');
  if (cnt) cnt.textContent = d.items.length + ' 部';
  const more = $('#dvMore');
  if (more) more.style.display = items.length >= 10 ? '' : 'none';
  if (items.length >= 10) d.page++;
}

function sourceBarHTML() {
  const cur = currentDiscoverSource();
  const chips = state.enabled
    .map(id => state.sources.find(x => x.id === id))
    .filter(Boolean)
    .map(x => '<button class="chip ' + (x.id === cur ? 'active' : '') + '" data-dvsrc="' + esc(x.id) + '">' +
      esc(x.name) + '</button>').join('');
  return '<div class="dv-srcbar"><span class="dv-srclabel">内容源</span>' +
    '<div class="dv-srclist" id="dvSources">' + chips + '</div></div>';
}

async function renderDiscoverFallback(src) {
  const view = $('#view');
  const d = state.discover;
  view.innerHTML = '<div class="loading-line"><div class="spinner"></div>正在加载内容…</div>';
  let secs = [];
  try {
    const r = await withTimeout(API.home(src), 15000, '内容');
    const list = parseJSON(r && r.data, []);
    secs = Array.isArray(list) ? list : [];
  } catch (e) { }

  if (!secs.length) {
    view.innerHTML = '<div class="empty"><div class="big">🍃</div><div>该源暂无可浏览内容<br>' +
      '<span style="font-size:12px;opacity:.7">可以直接用顶部搜索，或切到其他源</span></div></div>';
    return;
  }

  view.innerHTML = sourceBarHTML() + secs.map(sec => {
    const items = (sec.items || []).filter(x => x && x.id && x.name).slice(0, 18);
    if (!items.length) return '';
    return '<div class="section">' +
      '<div class="section-head"><h2>' + esc(sec.title || '内容') + '</h2>' +
      '<span class="more">' + items.length + ' 部</span></div>' +
      '<div class="grid">' + items.map(it => cardHTML(it, src, false)).join('') + '</div></div>';
  }).join('');

  bindSourceBar();
}

function bindSourceBar() {
  const el = $('#dvSources');
  if (!el) return;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-dvsrc]');
    if (!b) return;
    const id = b.dataset.dvsrc;
    if (id === state.discover.sourceId) return;
    state.discover.sourceId = id;
    state.discover.categories = [];
    state.discover.category = '';
    state.discover.filters = {};
    state.discover.items = [];
    await renderDiscover();
  };
}

async function setDiscoverTab(tab) {
  const d = state.discover;
  d.tab = tab;
  if (tab === 'new') {
    d.category = '20';   // 日漫
    d.filters = {};
    d.page = 1;
  } else {
    d.category = '';
    d.filters = {};
  }
  renderDiscoverShell();
  await loadDiscoverPage(true);
}

async function renderDiscover() {
  const d = state.discover;
  const view = $('#view');
  const src = currentDiscoverSource();
  if (!src) {
    view.innerHTML = `<div class="empty"><div class="big">📺</div><div>还没有启用任何内容源</div></div>`;
    return;
  }
  if (!d.categories.length || d.sourceId !== src) {
    view.innerHTML = `<div class="loading-line"><div class="spinner"></div>加载分类…</div>`;
    const r = await API.categories(src);
    const list = parseJSON(r && r.data, []);
    d.categories = Array.isArray(list) ? list.filter(Boolean) : [];
    d.sourceId = src;
    if (!d.categories.length) {
      // 该源没有分类接口：直接展示它的首页内容，保证所有源都能在「发现」里浏览
      await renderDiscoverFallback(src);
      return;
    }
    const withFilters = d.categories.find(c => Array.isArray(c.filters) && c.filters.length);
    if (!d.category && d.tab === 'browse') d.category = withFilters ? withFilters.key : (d.categories[0] || {}).key || '';
  }
  renderDiscoverShell();
  await loadDiscoverPage(true);
}


/* ---------------- 新番周表 ---------------- */
const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const SLOT_ORDER = { '凌晨': 0, '早间': 1, '上午': 2, '下午': 3, '傍晚': 4, '晚间': 5, '深夜': 6, '': 3 };

function todayWeekday() {
  const d = new Date().getDay();
  return '周' + ['日', '一', '二', '三', '四', '五', '六'][d];
}

async function renderSchedule(force) {
  const st = state.schedule;
  const view = $('#view');
  const fresh = st.list.length && !force && (Date.now() - st.at < 10 * 60 * 1000);
  if (!fresh) {
    view.innerHTML = '<div class="loading-line"><div class="spinner"></div>正在拉取新番周表…</div>';
    const r = await API.schedule();
    st.list = (r && r.ok && Array.isArray(r.list)) ? r.list : [];
    st.at = Date.now();
    if (!st.list.length) {
      view.innerHTML = '<div class="empty"><div class="big">📅</div><div>周表获取失败<br><span style="font-size:12px;opacity:.7">' + esc((r && r.error) || '网络错误') + '</span></div></div>';
      return;
    }
  }
  if (!st.day) st.day = todayWeekday();
  renderScheduleBody();
}

function renderScheduleBody() {
  const st = state.schedule;
  const view = $('#view');
  const counts = {};
  for (const it of st.list) counts[it.day] = (counts[it.day] || 0) + 1;
  const cur = (st.day === '全部' ? st.list.slice() : st.list.filter(x => x.day === st.day))
    .sort((a, b) => (SLOT_ORDER[a.slot] == null ? 3 : SLOT_ORDER[a.slot]) - (SLOT_ORDER[b.slot] == null ? 3 : SLOT_ORDER[b.slot]));

  view.innerHTML = `
    <div class="dv-tabs" id="wkTabs">
      <button class="chip ${st.day === '全部' ? 'active' : ''}" data-day="全部">全部 ${st.list.length}</button>
      ${WEEK_DAYS.map(d => `<button class="chip ${st.day === d ? 'active' : ''}" data-day="${d}">${d}${counts[d] ? ' ' + counts[d] : ''}${d === todayWeekday() ? ' ·' : ''}</button>`).join('')}
    </div>
    <div class="section-head" style="margin:14px 26px 12px">
      <h2>${st.day === '全部' ? '本周新番' : st.day + ' 更新'}</h2>
      <span class="more">${cur.length} 部${st.day === todayWeekday() ? ' · 今天' : ''}</span>
    </div>
    <div class="grid">
      ${cur.map(it => `
        <div class="card sch-card" data-sched-name="${esc(it.name)}" data-sched-id="${esc(it.id)}">
          <div class="poster">
            <div class="ph">封面</div>
            ${it.pic ? `<img loading="lazy" src="${esc(it.pic)}" alt="">` : ''}
            <span class="badge slot">${esc(it.day)}${it.slot ? ' · ' + esc(it.slot) : ''}</span>
          </div>
          <div class="cname">${esc(it.name)}</div>
          <div class="cmeta">${esc(it.slot || '更新时间未标注')}</div>
        </div>`).join('')}
    </div>`;

  const tabs = $('#wkTabs');
  if (tabs) tabs.onclick = (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    state.schedule.day = b.dataset.day;
    renderScheduleBody();
  };
  view.querySelectorAll('[data-sched-name]').forEach(el => {
    el.onclick = () => openScheduleItem(el.dataset.schedName, el.dataset.schedId);
  });
}

async function openScheduleItem(name) {
  if (!name) return;
  const order = ['lanerc', 'jinpai', ...state.enabled.filter(x => x !== 'lanerc' && x !== 'jinpai')];
  const targets = [...new Set(order)].filter(id => state.sources.some(s => s.id === id));
  toast('正在查找「' + name + '」…', 2000);
  for (const sid of targets) {
    try {
      const r = await API.search(sid, name, 1, {});
      const list = parseJSON(r && r.data, []);
      if (!Array.isArray(list) || !list.length) continue;
      const exact = list.find(x => x.name === name);
      const loose = list.find(x => x.name && (x.name.indexOf(name) >= 0 || name.indexOf(x.name) >= 0));
      const hit = exact || loose || list[0];
      if (hit) { await openDetail(sid, hit.id); return; }
    } catch (e) { }
  }
  toast('没有找到可播放的「' + name + '」，试试搜索', 3500);
}

/* ---------------- 搜索 ---------------- */
function renderSearchPage() {
  const view = $('#view');
  if (!state.results.length) {
    view.innerHTML = `<div class="empty"><div class="big">🔍</div><div>输入番剧名，回车搜索<br><span style="font-size:12px;opacity:.7">会同时在已启用的源里查找</span></div></div>`;
    return;
  }
  view.innerHTML = `<div class="section-head" style="margin:24px 26px 14px"><h2>搜索结果</h2><span class="more">${state.results.length} 条 · ${esc(state.searchQuery)}</span></div>` +
    `<div class="grid">${state.results.map(r => cardHTML(r.item, r.sourceId, true)).join('')}</div>`;
}

async function doSearch(q) {
  q = (q || '').trim();
  if (!q) { toast('请输入关键词'); return; }
  state.searchQuery = q;
  state.results = [];
  setNav('search');
  $('#titleBar').textContent = '搜索';
  const view = $('#view');
  view.innerHTML = `<div class="loading-line"><div class="spinner"></div>正在搜索「${esc(q)}」…</div>${skeletonGrid(12)}`;

  const targets = state.sources
    .filter(s0 => !(state.health[s0.id] && state.health[s0.id].ok === false))
    .map(s0 => s0.id);
  const out = [];
  await Promise.all(targets.map(async (sid) => {
    try {
      const r = await API.search(sid, q, 1, {});
      if (!r || !r.ok) return;
      const list = parseJSON(r.data, []);
      if (!Array.isArray(list)) return;
      for (const it of list) {
        if (it && it.id && it.name) out.push({ sourceId: sid, item: it });
      }
    } catch (e) { }
  }));

  // 同名去重（保留不同源，但名字完全相同的只留一个展示位）
  const seen = new Set();
  state.results = out.filter(r => {
    const k = r.sourceId + '|' + r.item.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  renderSearchPage();
  if (!state.results.length) {
    view.innerHTML = `<div class="empty"><div class="big">😶</div><div>没有找到「${esc(q)}」<br><span style="font-size:12px;opacity:.7">换个关键词，或在「管理源」里添加更多源</span></div></div>`;
  }
}

/* ---------------- 收藏 / 历史 ---------------- */
function renderFavorites() {
  const view = $('#view');
  const favs = state.store.favorites;
  if (!favs.length) {
    view.innerHTML = `<div class="empty"><div class="big">♡</div><div>还没有收藏<br><span style="font-size:12px;opacity:.7">在番剧详情页点「收藏」</span></div></div>`;
    return;
  }
  view.innerHTML = `<div class="section-head" style="margin:24px 26px 14px"><h2>我的收藏</h2><span class="more">${favs.length} 部</span></div>` +
    `<div class="grid">${favs.map(f => cardHTML(f, f.sourceId, true)).join('')}</div>`;
}

function pct(x) {
  if (!x.duration || !x.position) return 0;
  return Math.max(2, Math.min(100, Math.round((x.position / x.duration) * 100)));
}

function epLabel(x) {
  const cur = (x.episodeIndex || 0) + 1;
  const total = x.totalEpisodes || 0;
  return total > 0 ? ('第 ' + cur + ' 集 / 共 ' + total + ' 集') : ('看到第 ' + cur + ' 集');
}

function renderHistory() {
  const view = $('#view');
  const h = state.store.history;
  if (!h.length) {
    view.innerHTML = `<div class="empty"><div class="big">◷</div><div>还没有观看记录</div></div>`;
    return;
  }
  view.innerHTML = `<div class="section-head" style="margin:24px 26px 14px"><h2>观看历史</h2>
      <span class="more">${h.length} 条</span>
      <button class="btn btn-ghost" style="height:30px;padding:0 12px;font-size:12px;margin-left:auto" data-action="clear-history">清空</button></div>` +
    `<div class="grid">${h.map(x => `
      <div class="card hcard" data-id="${esc(x.id)}" data-src="${esc(x.sourceId)}" data-resume="1">
        <div class="poster">
          <div class="ph">封面</div>
          ${x.pic ? `<img loading="lazy" src="${esc(cleanPic(x.pic))}" >` : ''}
          <span class="badge">${esc(x.episodeName || ('第' + (x.episodeIndex + 1) + '集'))}</span>
          <div class="hprog"><i style="width:${pct(x)}%"></i></div>
        </div>
        <div class="cname">${esc(x.name)}</div>
        <div class="cmeta">${esc(x.sourceId === 'xifan' ? '稀饭动漫' : sourceName(x.sourceId))} · ${esc(epLabel(x))}</div>
        <div class="csub">${esc(fmtTime(x.position))} / ${esc(x.duration ? fmtTime(x.duration) : '--:--')}</div>
      </div>`).join('')}</div>`;
}

async function clearHistory() {
  await API.clearHistory();
  state.store.history = [];
  renderHistory();
  toast('已清空历史');
}

/* ---------------- 详情 ---------------- */
async function openDetail(sourceId, id) {
  state.detailFrom = state.route || (state.searchQuery ? 'search' : 'home');
  setNav('');
  $('#titleBar').textContent = '详情';
  const view = $('#view');
  view.innerHTML = `<div style="margin:26px">${skeletonRow(1)}</div><div class="loading-line"><div class="spinner"></div>加载详情…</div>`;
  view.scrollTop = 0;

  const r = await API.detail(sourceId, id, {});
  if (!r || !r.ok) { view.innerHTML = `<div class="empty"><div class="big">⚠</div><div>详情加载失败<br>${esc((r && r.error) || '网络错误')}</div></div>`; return; }
  const d = parseJSON(r.data, null);
  if (!d) { view.innerHTML = `<div class="empty"><div class="big">⚠</div><div>详情数据异常</div></div>`; return; }

  state.detail = { sourceId, id, data: d };
  const eps = Array.isArray(d.episodes) ? d.episodes : [];
  const locked = eps.filter(e => parseJSON(e.url, {}).canPlayWithoutLogin === false).length;
  const fav = isFav({ id, sourceId });

  // 按线路分组（Lanerc 会返回 LC-Main / LC-03 等多条线路）
  const groups = {};
  eps.forEach((e, i) => {
    const name = (e.route || '线路1').trim() || '线路1';
    (groups[name] = groups[name] || []).push({ ep: e, idx: i });
  });
  const routes = Object.keys(groups).map(name => ({ name, items: groups[name] }));
  state.detail.routes = routes;
  state.detail.line = routes.length ? routes[0].name : '';
  state.detail.eps = eps;

  view.innerHTML = `
  <div class="detail-hero">
    <div class="bg" style="background-image:url('${esc(cleanPic(d.pic))}')"></div>
    <div class="veil"></div>
    <div class="detail-inner">
      <div class="detail-poster">${d.pic ? `<img src="${esc(cleanPic(d.pic))}">` : ''}</div>
      <div class="detail-meta">
        <h1>${esc(d.name)}</h1>
        <div class="detail-sub">
          ${d.score ? `<span class="score">★ ${esc(d.score)}</span>` : ''}
          ${d.year ? `<span class="tag">${esc(d.year)}</span>` : ''}
          ${(d.type || '').split(/[,，]/).filter(Boolean).slice(0, 4).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
          ${d.remarks ? `<span class="tag">${esc(d.remarks)}</span>` : ''}
          <span class="tag">${esc(sourceName(sourceId))}</span>
          ${locked ? `<span class="tag" style="color:#ffc94d">${locked} 集需验证</span>` : ''}
        </div>
        <div class="detail-desc">${esc(d.desc || '暂无简介')}</div>
        <div class="detail-actions">
          <button class="btn btn-primary" id="btnPlayFirst">▶ 播放第 1 集</button>
          <button class="btn btn-ghost ${fav ? 'on' : ''}" id="btnFav">${fav ? '♥ 已收藏' : '♡ 收藏'}</button>
          <button class="btn btn-ghost" id="btnReload">↻ 换源</button>
        </div>
      </div>
    </div>
  </div>
  <div class="eps-head"><h3>剧集</h3><span class="count">共 ${eps.length} 集${routes.length > 1 ? ` · ${routes.length} 条线路` : ''}</span>
    ${routes.length > 1 ? `<div class="line-tabs" id="lineTabs">${routes.map(r => `<button class="chip ${r.name === state.detail.line ? 'active' : ''}" data-line="${esc(r.name)}">${esc(r.name)}</button>`).join('')}</div>` : ''}
  </div>
  <div class="eps-grid" id="epsGrid"></div>`;

  renderEpisodes();
  $('#lineTabs') && ($('#lineTabs').onclick = (ev) => {
    const b = ev.target.closest('[data-line]');
    if (!b) return;
    state.detail.line = b.dataset.line;
    $$('#lineTabs .chip').forEach(c => c.classList.toggle('active', c.dataset.line === state.detail.line));
    renderEpisodes();
  });

  $('#btnPlayFirst').onclick = () => {
    const cur = (state.detail.routes || []).find(r => r.name === state.detail.line) || (state.detail.routes || [])[0];
    if (cur && cur.items[0]) playEpisode(cur.items[0].idx);
  };
  const backBtn = $('#topBack');
  if (backBtn) backBtn.onclick = () => {
    const from = state.detailFrom || 'home';
    if (from === 'search' && state.searchQuery) { setNav('search'); doSearch(state.searchQuery); return; }
    if (from === 'favorites') { setNav('fav'); renderFavorites(); return; }
    if (from === 'history') { setNav('history'); renderHistory(); return; }
    if (from === 'schedule') { setNav('schedule'); renderSchedule(); return; }
    if (from === 'discover') { setNav('discover'); renderDiscover(); return; }
    setNav('home');
    renderHome();
  };

  $('#btnFav').onclick = async () => {
    const list = await API.toggleFav({ id, name: d.name, pic: cleanPic(d.pic), sourceId });
    state.store.favorites = list;
    const on = isFav({ id, sourceId });
    $('#btnFav').classList.toggle('on', on);
    $('#btnFav').textContent = on ? '♥ 已收藏' : '♡ 收藏';
    toast(on ? '已加入收藏' : '已取消收藏');
  };
  $('#btnReload').onclick = () => openDetail(sourceId, id);
  $('#epsGrid').onclick = (ev) => {
    const b = ev.target.closest('.ep-btn');
    if (b) playEpisode(Number(b.dataset.ep));
  };
}

/** 渲染当前线路的剧集 */
function renderEpisodes() {
  const det = state.detail;
  if (!det) return;
  const routes = det.routes || [];
  const cur = routes.find(r => r.name === det.line) || routes[0];
  const grid = $('#epsGrid');
  if (!grid) return;
  if (!cur) { grid.innerHTML = `<div class="empty">该源没有返回剧集</div>`; return; }
  grid.innerHTML = cur.items.map(({ ep, idx }) =>
    `<button class="ep-btn ${idx === state.epIndex ? 'current' : ''}" data-ep="${idx}">${esc(ep.name || ('第' + (idx + 1) + '集'))}</button>`
  ).join('');
}

/* ---------------- 播放 ---------------- */
function renderPlayerInfo() {
  const d = state.detail && state.detail.data;
  if (!d) return;
  const eps = Array.isArray(d.episodes) ? d.episodes : [];
  const poster = $('#piPoster');
  if (poster) { const src = d.pic ? cleanPic(d.pic) : ''; poster.src = src; poster.style.visibility = src ? 'visible' : 'hidden'; }
  const t = $('#piTitle'); if (t) t.textContent = d.name || '';
  const sub = $('#piSub');
  if (sub) {
    const bits = [];
    if (d.year) bits.push(d.year);
    if (d.score) bits.push('★ ' + d.score);
    if (d.type) bits.push(String(d.type).split(/[,，]/)[0]);
    if (episodeCountText(eps)) bits.push(episodeCountText(eps));
    sub.innerHTML = bits.filter(Boolean).map(x => '<span>' + esc(x) + '</span>').join('');
  }
  const desc = $('#piDesc'); if (desc) desc.textContent = d.desc || '暂无简介';
  const cnt = $('#piCount'); if (cnt) cnt.textContent = ' 共 ' + eps.length + ' 集';
  const grid = $('#piEps');
  if (grid) {
    grid.innerHTML = eps.map((e, i) =>
      '<button data-i="' + i + '" class="' + (i === state.epIndex ? 'cur' : '') + '">' +
      esc(e.name || ('第' + (i + 1) + '集')) + '</button>').join('');
    grid.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (b) playEpisode(Number(b.dataset.i));
    };
  }
}

function episodeCountText(eps) {
  return Array.isArray(eps) && eps.length ? '共 ' + eps.length + ' 集' : '';
}

function showPlayerShell(title) {
  $('#player').classList.remove('hidden');
  $('#pTitle').textContent = title || '';
  renderPlayerInfo();
  $('#pError').classList.add('hidden');
  $('#epPanel').classList.add('hidden');
  $('#pLoading').classList.remove('hidden');
  $('#pLoadingText').textContent = '获取播放地址…';
}

function hidePlayer() {
  const p = $('#player');
  p.classList.add('hidden');
  p.classList.remove('idle');
  const v = $('#video');
  try { v.pause(); } catch (e) { }
  v.removeAttribute('src'); v.load();
  if (state.player) { state.player.destroy(); state.player = null; }
  resetIdleTimer();
}

async function playEpisode(index) {
  const det = state.detail;
  if (!det) return;
  const eps = det.data.episodes || [];
  const ep = eps[index];
  if (!ep) return;
  state.epIndex = index;

  const flag = parseJSON(ep.url, {});
  showPlayerShell(`${det.data.name} · ${ep.name || ('第' + (index + 1) + '集')}`);
  const header = { ...det };
  state.pendingPlay = { sourceId: det.sourceId, flag: ep.url, epIndex: index };

  await resolveAndPlay();
}

async function resolveAndPlay(retry) {
  const pp = state.pendingPlay;
  if (!pp) return;
  const det = state.detail;
  $('#pLoading').classList.remove('hidden');
  $('#pLoadingText').textContent = '获取播放地址…';
  $('#pError').classList.add('hidden');

  let r;
  try {
    r = await API.play(pp.sourceId, pp.flag, {}, null);
  } catch (e) {
    r = { ok: false, error: String(e.message || e) };
  }
  if (!r || !r.ok) {
    showPlayError('获取播放地址失败', (r && r.error) || '请稍后重试', pp.sourceId);
    return;
  }
  const res = parseJSON(r.data, {});
  if (!res || !res.url) {
    if (res.needBind && !retry) {
      openCaptcha(pp.sourceId, () => resolveAndPlay(true));
      return;
    }
    if (res.needLogin && !retry) {
      // 直接弹登录窗，登录成功后自动重试本集
      toast((res.error || '该源需要登录后才能播放') + '，已为你打开登录窗口', 3200);
      openLoginDialog(pp.sourceId, () => resolveAndPlay(true));
      return;
    }
    if (res.needLogin) {
      showPlayError('需要登录', res.error || '该集需要登录后观看', pp.sourceId, true);
      return;
    }
    showPlayError('暂无片源', res.error || '该集没有可用的播放地址', pp.sourceId);
    return;
  }
  startPlayback(res, pp);
}


let videoStats = null;

// buffered 给的是秒，换算成"缓冲速率"（每秒缓冲多少秒内容）+ 估算带宽
function fmtBufferRate(secPerSec, v) {
  if (!secPerSec || secPerSec <= 0) return '';
  // 用视频时长与估算码率粗略换算带宽（无法拿到精确字节数）
  const rate = secPerSec;
  if (rate >= 1.8) return '缓冲 ' + rate.toFixed(1) + '×';
  if (rate >= 1.0) return '缓冲 ' + rate.toFixed(1) + '×（刚好跟得上）';
  return '缓冲 ' + rate.toFixed(1) + '×（偏慢）';
}

function startPlayback(res, pp) {

  const v = $('#video');
  const url = res.url;
  const headers = res.headers || {};
  $('#pLoading').classList.add('hidden');
  $('#pError').classList.add('hidden');

  const AD_HINTS = ['feishucdn.com', 'anycross', 'byteimg.com'];
  if (AD_HINTS.some(h => url.indexOf(h) >= 0)) {
    toast('该集匿名只返回预告片，可尝试「换源」或登录官方账号', 4200);
  }

  if (state.player) { state.player.destroy(); state.player = null; }
  const isHls = /\.m3u8(?:$|[?#])/i.test(url) || (res.type || '').toLowerCase() === 'm3u8';

  if (isHls && window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({
      maxBufferLength: 40,
      xhrSetup: (xhr) => {
        for (const k of Object.keys(headers)) { try { xhr.setRequestHeader(k, headers[k]); } catch (e) { } }
      }
    });
    hls.on(window.Hls.Events.ERROR, (ev, data) => {
      if (!data.fatal) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) { try { hls.startLoad(); } catch (e) { } }
      else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) { try { hls.recoverMediaError(); } catch (e) { } }
      else {
        showPlayError('播放失败', data.details || '视频流无法解码', pp.sourceId);
      }
    });
    hls.loadSource(url);
    hls.attachMedia(v);
    state.player = hls;
  } else {
    v.src = url;
  }
  v.play().catch(() => { });

  // 恢复进度
  const key = `${pp.sourceId}|${state.detail.id}|${pp.epIndex}`;
  state.currentKey = key;
  const saved = Number(localStorage.getItem('pos:' + key) || 0);
  v.onloadedmetadata = () => {
    if (saved > 5 && saved < (v.duration || 0) - 10) { v.currentTime = saved; toast('已从上次位置继续'); }
    v.onloadedmetadata = null;
  };

  updatePlayIcon();
  resetIdleTimer();
  startProgressLoop();
  markEpisodeCurrent(pp.epIndex);
  const piGrid = $('#piEps');
  if (piGrid) {
    Array.from(piGrid.children).forEach((b, i) => b.classList.toggle('cur', i === pp.epIndex));
  }
  renderEpisodePanel();
}

function markEpisodeCurrent(idx) {
  $$('#epsGrid .ep-btn').forEach((b, i) => b.classList.toggle('current', Number(b.dataset.ep) === idx));
}

function showPlayError(title, msg, sourceId, needLogin) {
  $('#pLoading').classList.add('hidden');
  const el = $('#pError');
  el.classList.remove('hidden');
  el.innerHTML = `<div style="font-size:15px;font-weight:600">${esc(title)}</div>
    <div style="max-width:520px;color:#b9bec9">${esc(msg)}</div>
    <div class="btns">
      <button class="btn btn-primary" id="errRetry">重试</button>
      ${sourceId === 'lanerc' ? `<button class="btn btn-ghost" id="errLogin">账号登录</button>` : ''}
      <button class="btn btn-ghost" id="errSwitch">换个源</button>
      <button class="btn btn-ghost" id="errBack">返回</button>
    </div>`;
  $('#errRetry').onclick = () => { el.classList.add('hidden'); resolveAndPlay(false); };
  if ($('#errLogin')) $('#errLogin').onclick = () => openLoginDialog();
  $('#errSwitch').onclick = () => switchSourceForCurrent();
  $('#errBack').onclick = () => { hidePlayer(); go('home'); };
}

async function switchSourceForCurrent() {
  const det = state.detail;
  if (!det) return;
  const others = state.enabled
    .filter(id => id !== det.sourceId && !(state.health[id] && state.health[id].ok === false))
    .map(id => state.sources.find(s0 => s0.id === id))
    .filter(Boolean);
  if (!others.length) { toast('没有其它可用源，试试在「管理源」里添加'); return; }
  toast('正在其他源里查找「' + det.data.name + '」…', 3000);
  for (const s0 of others) {
    try {
      const r = await withTimeout(API.search(s0.id, det.data.name, 1, {}), 10000, s0.name);
      const list = parseJSON(r && r.data, []);
      if (!Array.isArray(list) || !list.length) continue;
      const hit = list.find(x => x.name === det.data.name)
        || list.find(x => x.name && (x.name.indexOf(det.data.name) >= 0 || det.data.name.indexOf(x.name) >= 0))
        || list[0];
      if (!hit) continue;
      hidePlayer();
      await openDetail(s0.id, hit.id);
      toast('已切换到 ' + s0.name);
      return;
    } catch (e) { }
  }
  toast('其他源里没有找到「' + det.data.name + '」', 3500);
}

/* ---------------- 播放器控制 ---------------- */
function updatePlayIcon() {
  const v = $('#video');
  const playing = !v.paused && !v.ended;
  $('#pPlay').innerHTML = playing
    ? `<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`
    : `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
}

let progressTimer = null;
function startProgressLoop() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    const v = $('#video');
    if (!v.duration) return;
    $('#seek').value = String(Math.round((v.currentTime / v.duration) * 1000));
    $('#pTime').textContent = `${fmtTime(v.currentTime)} / ${fmtTime(v.duration)}`;
  }, 500);
}

function resetIdleTimer() {
  const p = $('#player');
  if (p.classList.contains('hidden')) return;
  p.classList.remove('idle');
  const bk = $('#pBack');
  if (bk) bk.style.removeProperty('opacity');
  clearTimeout(state.hideTimer);
  state.hideTimer = setTimeout(() => {
    const v = $('#video');
    if (!v.paused) {
      p.classList.add('idle');
      const b = $('#pBack');
      // 不用 0：Chromium 会跳过完全透明元素的命中测试，导致点不到
      if (b) b.style.setProperty('opacity', '.05', 'important');
    }
  }, 2800);
}

function renderEpisodePanel() {
  const det = state.detail;
  if (!det) return;
  const eps = det.data.episodes || [];
  $('#epList').innerHTML = eps.map((e, i) =>
    `<button class="ep-item ${i === state.epIndex ? 'current' : ''}" data-pep="${i}">${esc(e.name || ('第' + (i + 1) + '集'))}</button>`
  ).join('');
}

async function saveHistory() {
  const det = state.detail;
  if (!det) return;
  const v = $('#video');
  const pp = state.pendingPlay;
  if (!pp) return;
  const ep = (det.data.episodes || [])[pp.epIndex] || {};
  await API.upsertHistory({
    id: det.id, name: det.data.name, pic: cleanPic(det.data.pic), sourceId: det.sourceId,
    episodeIndex: pp.epIndex, episodeName: ep.name || '',
    totalEpisodes: (det.data.episodes || []).length,
    position: v.currentTime || 0, duration: v.duration || 0
  });
  const store = await API.getStore();
  state.store = store;
}

function bindPlayer() {
  const v = $('#video');
  v.addEventListener('play', updatePlayIcon);
  v.addEventListener('pause', updatePlayIcon);
  v.addEventListener('timeupdate', () => {
    if (!v.duration) return;
    const key = state.currentKey;
    if (key && Math.floor(v.currentTime) % 5 === 0) localStorage.setItem('pos:' + key, String(Math.floor(v.currentTime)));
  });
  v.addEventListener('ended', async () => {
    await saveHistory();
    if (state.settings.autoPlayNext) {
      const eps = (state.detail && state.detail.data.episodes) || [];
      if (state.epIndex + 1 < eps.length) playEpisode(state.epIndex + 1);
    }
  });
  v.addEventListener('error', () => {
    const pp = state.pendingPlay;
    if (pp && v.src) showPlayError('播放失败', '视频源无法加载或已过期', pp.sourceId);
  });
  v.addEventListener('dblclick', () => toggleFull());
  $('#player').addEventListener('mousemove', resetIdleTimer);
  $('#player').addEventListener('mousedown', resetIdleTimer);

  // 滚轮：左半屏调亮度，右半屏调音量
  const playerEl = $('#player');
  if (playerEl && !playerEl.dataset.wheelBound) {
    playerEl.dataset.wheelBound = '1';
    playerEl.addEventListener('wheel', (e) => {
      const v2 = $('#video');
      if (!v2) return;
      e.preventDefault();
      const rect = playerEl.getBoundingClientRect();
      const isLeft = (e.clientX - rect.left) < rect.width / 2;
      const step = e.deltaY > 0 ? -0.05 : 0.05;
      if (isLeft) {
        const cur = Number(v2.dataset.brightness || 1);
        const next = Math.max(0.3, Math.min(2, cur + step));
        v2.dataset.brightness = String(next);
        v2.style.filter = 'brightness(' + next.toFixed(2) + ')';
        showOsd('亮度 ' + Math.round(next * 100) + '%');
      } else {
        const next = Math.max(0, Math.min(1, v2.volume + step));
        v2.volume = next;
        v2.muted = next === 0 ? true : false;
        showOsd('音量 ' + Math.round(next * 100) + '%');
      }
    }, { passive: false });
  }

  // 左上角热区兜底：即使按钮被任何层级影响，点这里也能返回
  const vid = $('#video');
  if (vid && !vid.dataset.hotBackBound) {
    vid.dataset.hotBackBound = '1';
    vid.addEventListener('click', (e) => {
      const r = vid.getBoundingClientRect();
      if ((e.clientX - r.left) < 72 && (e.clientY - r.top) < 60) {
        const b = $('#pBack');
        if (b) b.click();
      }
    });
  }

  $('#pPlay').onclick = () => { const v2 = $('#video'); v2.paused ? v2.play() : v2.pause(); };
  let osdTimer = null;
  function showOsd(text) {
    const el = $('#playerOsd');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(() => el.classList.add('hidden'), 900);
  }

  $('#pRew').onclick = () => { const v2 = $('#video'); v2.currentTime = Math.max(0, v2.currentTime - 10); showOsd('−10s'); };
  $('#pFwd').onclick = () => { const v2 = $('#video'); v2.currentTime = Math.min(v2.duration || 1e9, v2.currentTime + 10); showOsd('+10s'); };
  $('#seek').oninput = (e) => { if (v.duration) v.currentTime = (Number(e.target.value) / 1000) * v.duration; };
  $('#pBack').onclick = async () => { await saveHistory(); hidePlayer(); if (state.detail) openDetail(state.detail.sourceId, state.detail.id); else go('home'); };
  $('#pPrev').onclick = () => { if (state.epIndex > 0) playEpisode(state.epIndex - 1); else showOsd('已经是第一集'); };
  $('#pNext').onclick = () => { const eps = (state.detail && state.detail.data.episodes) || []; if (state.epIndex + 1 < eps.length) playEpisode(state.epIndex + 1); };
  $('#pRate').onchange = (e) => { v.playbackRate = Number(e.target.value); };
  $('#pMute').onclick = () => { v.muted = !v.muted; $('#pMute').style.opacity = v.muted ? .5 : 1; };
  $('#pPageFull').onclick = () => {
    const pl = $('#player');
    pl.classList.toggle('page-full');
    if (pl.classList.contains('page-full')) {
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
    }
    showOsd(pl.classList.contains('page-full') ? '页面全屏' : '退出页面全屏');
  };
  $('#pFull').onclick = async () => {
    try {
      const r = await API.toggleFullScreen();
      const on = !!(r && r.fullscreen);
      document.body.classList.toggle('win-fullscreen', on);
      showOsd(on ? '屏幕全屏' : '退出屏幕全屏');
    } catch (e) { }
  };
  $('#pEpisodes').onclick = () => {
    const p = $('#epPanel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) renderEpisodePanel();
  };
  $('#epClose').onclick = () => $('#epPanel').classList.add('hidden');
  $('#epList').onclick = (e) => {
    const b = e.target.closest('.ep-item');
    if (!b) return;
    $('#epPanel').classList.add('hidden');
    playEpisode(Number(b.dataset.pep));
  };

  document.addEventListener('keydown', (e) => {
    if ($('#player').classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
    else if (e.code === 'ArrowRight') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); }
    else if (e.code === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 10); }
    else if (e.code === 'KeyN') { $('#pNext').click(); }
    else if (e.code === 'KeyF') { toggleFull(); }
    else if (e.code === 'Escape') {
    const pl = $('#player');
    if (pl.classList.contains('page-full')) { pl.classList.remove('page-full'); showOsd('退出页面全屏'); return; }
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (API.exitFullScreen) { API.exitFullScreen(); }
    $('#pBack').click();
  }
  });
}

function toggleFull() {
  const p = $('#player');
  if (!document.fullscreenElement) p.requestFullscreen().catch(() => { });
  else document.exitFullscreen();
}

/* ---------------- 验证码 ---------------- */
async function openCaptcha(sourceId, onSuccess) {
  $('#captchaModal').classList.remove('hidden');
  $('#captchaBody').innerHTML = `<div class="loading-line"><div class="spinner"></div>获取验证码…</div>`;
  const r = await API.guestCaptcha(sourceId);
  const res = parseJSON(r && r.data, {});
  if (!r || !r.ok || !res.ok) {
    $('#captchaBody').innerHTML = `<div class="captcha-tip" style="color:#ff9093">${esc((res && res.error) || (r && r.error) || '验证码获取失败')}</div>
      <button class="btn btn-ghost" id="capRetry">重试</button>`;
    const b = $('#capRetry'); if (b) b.onclick = () => openCaptcha(sourceId, onSuccess);
    return;
  }
  const img = res.image;
  const imgSrc = /^data:/i.test(img) ? img : (/^https?:/i.test(img) ? img : 'data:image/png;base64,' + img);
  const n = res.optionCount || 4;
  $('#captchaBody').innerHTML = `
    <div class="captcha-img"><img id="capImg" src="${esc(imgSrc)}"></div>
    <div class="captcha-tip">请在图片中选出与提示相符的选项，点击下方对应数字。（${esc(n)} 选 1）</div>
    <div class="captcha-opts" id="capOpts">${Array.from({ length: n }, (_, i) => `<button class="captcha-opt" data-opt="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div id="capMsg" class="captcha-tip"></div>`;
  $('#capOpts').onclick = async (e) => {
    const b = e.target.closest('.captcha-opt');
    if (!b) return;
    $('#capMsg').textContent = '验证中…';
    const rr = await API.guestBind(sourceId, res.challengeId, Number(b.dataset.opt));
    const rres = parseJSON(rr && rr.data, {});
    if (rres.ok) {
      $('#captchaModal').classList.add('hidden');
      toast('验证通过');
      if (onSuccess) onSuccess();
    } else {
      $('#capMsg').textContent = (rres && rres.error) || '验证失败';
      setTimeout(() => openCaptcha(sourceId, onSuccess), 900);
    }
  };
}
$('#captchaClose').onclick = () => { $('#captchaModal').classList.add('hidden'); };

/* ---------------- 登录 ---------------- */
async function openLoginDialog(sourceId, onSuccess) {
  sourceId = sourceId || 'lanerc';
  const src = state.sources.find(x => x.id === sourceId) || { id: sourceId, name: sourceId };
  const isEmail = sourceId === 'lanerc';
  // 读取已保存账号（仅账号名，不含密码）
  let savedAcc = '';
  try {
    const c = await API.getCreds();
    if (c && c.ok && c.account && (!c.sourceId || c.sourceId === sourceId)) savedAcc = c.account;
  } catch (e) { }

  openModal('登录 · ' + src.name, `
    <div class="login-src">
      <span class="login-src-badge">内容源</span>
      <b>${esc(src.name)}</b>
      ${savedAcc ? '<span class="login-saved">已保存账号：' + esc(savedAcc) + '</span>' : ''}
    </div>
    <div class="field">
      <label>${isEmail ? '账号（邮箱）' : '账号'}</label>
      <input id="loginAcc" value="${esc(savedAcc)}" placeholder="${isEmail ? '请输入邮箱，例如 name@qq.com' : '请输入账号'}" />
    </div>
    <div class="field">
      <label>密码</label>
      <input id="loginPwd" type="password" placeholder="请输入密码" />
    </div>
    <div class="captcha-tip">${isEmail
      ? 'Lanerc 只支持<b>邮箱</b>登录（手机号/用户名会提示"不支持该邮箱域名"）。'
      : '登录成功后播放地址将由该源的账号权限获取。'}凭据加密保存在本机，下次自动登录。</div>
    <div style="display:flex;gap:10px;margin-top:6px">
      <button class="btn btn-primary" id="doLogin">登录</button>
      <span id="loginMsg" class="captcha-tip"></span>
    </div>
  `);

  const submit = async () => {
    const acc = ($('#loginAcc').value || '').trim();
    const pwd = $('#loginPwd').value || '';
    const msg = $('#loginMsg');
    if (!acc || !pwd) { msg.textContent = '请填写账号和密码'; return; }
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(acc)) {
      msg.textContent = '请填写完整邮箱（手机号/用户名不支持）';
      return;
    }
    msg.textContent = '登录中…';
    let r = null;
    try { r = await API.login(sourceId, acc, pwd); } catch (e) { r = { ok: false, error: String(e.message || e) }; }
    const res = parseJSON(r && r.data, {});
    if (res && res.ok) {
      try { await API.saveCreds(sourceId, acc, pwd); } catch (e) { }
      closeModal();
      toast('登录成功，凭据已保存', 2600);
      if (typeof onSuccess === 'function') onSuccess();
      else resolveAndPlay(false);
    } else {
      msg.textContent = (res && res.error) || (r && r.error) || '登录失败';
    }
  };

  $('#doLogin').onclick = submit;
  $('#loginPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  setTimeout(() => { const el = $('#loginAcc'); if (el && !el.value) el.focus(); else $('#loginPwd') && $('#loginPwd').focus(); }, 120);
}

/* ---------------- 设置 ---------------- */
function openModal(title, bodyHTML) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modalClose').onclick = closeModal;
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

async function openSourceAccounts() {
  // 需要登录的源：描述里带「登录」的，外加已知需要登录的
  const need = state.sources.filter(x => /登录/.test(x.desc || '') || x.id === 'lanerc' || x.id === 'cycani');
  let saved = [];
  try {
    const c = await API.getCreds();
    // 兼容两种返回：{ list: [...] } 或单源 { sourceId, account }
    if (c && c.ok) {
      if (Array.isArray(c.list)) saved = c.list;
      else if (c.account) saved = [{ sourceId: c.sourceId, account: c.account }];
    }
  } catch (e) { }
  const accOf = (id) => {
    const x = saved.find(v => v.sourceId === id) ||
      (state.store && state.store.login && state.store.login[id]) || null;
    return x ? (x.account || '') : '';
  };

  openModal('播放源账号', `
    <div class="acc-tip">下列内容源需要登录才能播放正片。账号只保存在本机，加密存储，不会上传。</div>
    <div class="acc-list">
      ${need.length ? need.map(x => {
        const acc = accOf(x.id);
        return '<div class="acc-row">' +
          '<div class="acc-info"><b>' + esc(x.name) + '</b>' +
          '<span class="' + (acc ? 'acc-on' : 'acc-off') + '">' + (acc ? ('已登录：' + esc(acc)) : '未登录') + '</span></div>' +
          '<div class="acc-ops">' +
          '<button class="btn btn-ghost" data-acc-login="' + esc(x.id) + '">' + (acc ? '修改' : '登录') + '</button>' +
          (acc ? '<button class="btn btn-ghost" data-acc-clear="' + esc(x.id) + '">清除</button>' : '') +
          '</div></div>';
      }).join('') : '<div class="acc-empty">当前没有需要登录的源</div>'}
    </div>
  `);

  const body = $('#modalBody');
  if (!body) return;
  body.onclick = async (e) => {
    const loginBtn = e.target.closest('[data-acc-login]');
    if (loginBtn) {
      closeModal();
      openLoginDialog(loginBtn.dataset.accLogin, async () => { await openSourceAccounts(); });
      return;
    }
    const clearBtn = e.target.closest('[data-acc-clear]');
    if (clearBtn) {
      await API.clearCreds(clearBtn.dataset.accClear);
      toast('已清除该源账号', 2000);
      await openSourceAccounts();
    }
  };
}

async function openSettings() {
  const s = state.settings;
  openModal('设置', `
    <div class="set-row"><div><div>自动连播下一集</div><div class="sub">本集结束后自动播放</div></div>
      <input type="checkbox" id="setAutoNext" ${s.autoPlayNext ? 'checked' : ''}></div>
    <div class="set-row"><div><div>显示模式</div><div class="sub">日间 / 夜间，背景随模式切换</div></div>
      <button class="btn btn-ghost" id="setTheme2">切换模式</button></div>
    <div class="set-row"><div><div>背景图片</div><div class="sub">选择本地图片作为主界面背景</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="pickBg">选择图片</button>
        <button class="btn btn-ghost" id="resetBg">恢复默认</button>
      </div></div>
    <div class="set-row"><div><div>观看数据</div><div class="sub">收藏 ${state.store.favorites.length} · 历史 ${state.store.history.length}</div></div>
      <button class="btn btn-ghost" id="clearHist">清空历史</button></div>
    </div>
    <div class="set-row"><div><div>问题反馈</div><div class="sub">一键导出诊断日志，并发送到开发者邮箱</div></div>
      <button class="btn btn-primary" id="feedback">反馈问题</button></div>
    <div class="set-row"><div><div>播放源账号</div><div class="sub">需要登录的源可在这里快速添加、修改或清除账号</div></div>
      <button class="btn btn-ghost" id="srcAccounts">管理账号</button></div>
    <div class="set-row"><div><div>日志导出位置</div><div class="sub" id="logDirText">默认：下载文件夹</div></div>
      <button class="btn btn-ghost" id="pickLogDir">选择位置</button></div>
    <div class="set-row"><div><div>诊断日志</div><div class="sub">遇到问题时导出，便于排查</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="exportLog">导出日志</button>
        <button class="btn btn-ghost" id="openLog">打开日志目录</button>
      </div></div>
    <div class="set-row"><div><div>版本</div><div class="sub">M记 1.0.4 · 本地源引擎</div></div></div>
  `);
  $('#exportLog').onclick = async () => {
    try {
      API.logToMain('info', 'USER_EXPORT_DIAG ' + JSON.stringify({
        route: state.route,
        source: state.sourceId,
        detail: state.detail ? { id: state.detail.id, sourceId: state.detail.sourceId } : null,
        ep: state.epIndex,
        enabled: state.enabled
      }));
    } catch (e) { }
    const r = await API.exportDiag();
    if (r && r.ok) toast('已导出：' + r.path, 6000);
    else if (r && r.canceled) { }
    else toast('导出失败：' + ((r && r.error) || '未知错误'));
  };
  $('#openLog').onclick = () => API.openLogDir();

  $('#srcAccounts').onclick = () => openSourceAccounts();

  (function initLogDir() {
    const t = $('#logDirText');
    const d = state.store && state.store.settings && state.store.settings.logDir;
    if (t) t.textContent = d ? ('当前：' + d) : '默认：下载文件夹';
  })();
  $('#pickLogDir').onclick = async () => {
    const r = await API.pickDir();
    if (!r || !r.ok) { if (r && r.canceled) return; toast('未选择目录'); return; }
    if (!state.store.settings) state.store.settings = {};
    state.store.settings.logDir = r.dir;
    const t = $('#logDirText');
    if (t) t.textContent = '当前：' + r.dir;
    toast('日志将默认导出到：' + r.dir, 3200);
  };

  $('#feedback').onclick = async () => {
    openModal('问题反馈', `
      <div class="fb-guide">
        <b>这是什么？</b>
        <p>播放失败、界面异常，或者觉得哪里可以更好用，都可以在这里说。
           写完点「发送反馈」，会自动打开你的邮件客户端，收件人和内容都已经填好。</p>
      </div>
      <div class="fb-sec">
        <div class="fb-label">① 描述你遇到的问题或建议 <i>（必填）</i></div>
        <textarea id="fbText" rows="5" placeholder="例如：&#10;· 点第 3 集播放没有反应，其他集正常&#10;· 希望首页能按年份筛选&#10;· 搜索有时候很久才出结果"></textarea>
      </div>
      <label class="fb-check">
        <input type="checkbox" id="fbWithLog">
        <span>② 附带诊断日志<i>（可选）</i></span>
      </label>
      <div class="fb-hint">日志只包含程序版本、系统环境与运行记录，<b>不含账号密码</b>。勾选后发送时会自动导出，需要你把它作为附件加进邮件。</div>
      <div class="fb-actions">
        <button class="btn btn-primary" id="fbSend">发送反馈</button>
        <button class="btn btn-ghost" id="fbCopy">复制内容</button>
      </div>
    `);

    const buildBody = async () => {
      const text = ($('#fbText').value || '').trim();
      if (!text) { toast('请先写一下问题或建议'); return null; }
      let logPath = '';
      if ($('#fbWithLog').checked) {
        const r = await API.exportDiagQuiet().catch(() => null);
        if (r && r.ok) logPath = r.path;
        else toast('日志导出失败，将只发送文字内容', 2600);
      }
      return '问题描述：\n' + text + '\n\n' +
        (logPath ? '诊断日志（请作为附件发送）：\n' + logPath + '\n' : '（未附带日志）\n') +
        '\n—— 由 M记 反馈入口生成 ' + new Date().toLocaleString();
    };

    const mail = 'm21419143@gmail.com';
    $('#fbSend').onclick = async () => {
      const body = await buildBody();
      if (!body) return;
      window.open('mailto:' + mail + '?subject=' + encodeURIComponent('M记 反馈') + '&body=' + encodeURIComponent(body));
      closeModal();
      toast('已打开邮件客户端', 2600);
    };
    $('#fbCopy').onclick = async () => {
      const body = await buildBody();
      if (!body) return;
      try {
        await navigator.clipboard.writeText(body + '\n\n收件人：' + mail);
        toast('已复制，可粘贴到任意地方发送', 3000);
      } catch (e) { toast('复制失败', 2000); }
    };
  };

  $('#setTheme2').onclick = () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'night';
    applyTheme(cur === 'light' ? 'night' : 'light');
  };
  $('#pickBg').onclick = pickBackground;
  $('#resetBg').onclick = resetBackground;
  $('#setAutoNext').onchange = async (e) => {
    state.settings = await API.saveSettings({ autoPlayNext: e.target.checked });
  };

  $('#clearHist').onclick = async () => { await clearHistory(); closeModal(); toast('历史已清空'); };
}


/* ---------------- 源管理（独立弹窗） ---------------- */
async function refreshSources() {
  try {
    const list = await API.listSources();
    if (Array.isArray(list) && list.length) state.sources = list;
    state.enabled = state.enabled.filter(id => state.sources.some(x => x.id === id));
    renderSourceChips();
  } catch (e) { }
}

function sourceRowsHtml() {
  return state.sources.map(x => {
    const on = state.enabled.includes(x.id);
    const h = state.health[x.id];
    const dead = h && h.ok === false;
    return '<div class="src-row">' +
      '<div class="src-info">' +
      '<div class="src-name">' + esc(x.name) +
      (x.custom ? '<span class="src-tag">自定义</span>' : '') +
      (dead ? '<span class="src-tag bad">不可用</span>' : '') + '</div>' +
      '<div class="src-sub">' + esc(x.id) + (h ? ' · ' + (h.ok ? h.count + ' 条' : '检测失败') : '') + '</div>' +
      '</div>' +
      '<div class="src-actions">' +
      '<label class="switch"><input type="checkbox" data-src-on="' + esc(x.id) + '"' + (on ? ' checked' : '') + '></label>' +
      (x.custom ? '<button class="sdel" data-src-del="' + esc(x.id) + '" title="删除">✕</button>' : '') +
      '</div></div>';
  }).join('');
}

async function openSourceManager() {
  const body = '<div class="src-toolbar">' +
    '<button class="btn btn-primary" id="srcImportFile">导入源文件</button>' +
    '<button class="btn btn-ghost" id="srcImportUrl">从链接导入</button>' +
    '<button class="btn btn-ghost" id="srcCheck">检测可用性</button>' +
    '</div>' +
    '<div class="src-site-row">' +
    '<input id="siteInput" type="text" placeholder="粘贴视频网站网址，例如 https://next.xifanacg.com" />' +
    '<button class="btn btn-primary" id="siteAdd">识别并添加</button>' +
    '</div>' +
    '<div class="src-url-row" id="srcUrlRow" style="display:none">' +
    '<input id="srcUrlInput" type="text" placeholder="粘贴 .js 源脚本链接，例如 https://example.com/xifan.js" />' +
    '<button class="btn btn-primary" id="srcUrlGo">导入</button>' +
    '<button class="btn btn-ghost" id="srcUrlCancel">取消</button>' +
    '</div>' +
    '<div class="src-list-vert" id="srcRows">' + sourceRowsHtml() + '</div>' +
    '<div class="captcha-tip">自定义源保存在 <code>%APPDATA%\\M记\\sources</code>，脚本需实现 search / detail / play 等接口。勾选即启用。</div>';
  openModal('内容源', body);

  const siteAdd = $('#siteAdd');
  if (siteAdd) siteAdd.onclick = async () => {
    const inp = $('#siteInput');
    const url = ((inp && inp.value) || '').trim();
    if (!url) { toast('请先粘贴网站网址'); if (inp) inp.focus(); return; }
    siteAdd.disabled = true;
    siteAdd.textContent = '识别中…';
    let r = null;
    try { r = await API.addSite(url); } catch (e) { r = { ok: false, error: String(e.message || e) }; }
    siteAdd.disabled = false;
    siteAdd.textContent = '识别并添加';
    if (r && r.ok) {
      await refreshSources();
      const el = $('#srcRows'); if (el) el.innerHTML = sourceRowsHtml();
      if (inp) inp.value = '';
      toast('已添加：' + (r.name || '站点') + (r.classes ? '（' + r.classes + ' 个分类）' : ''), 4000);
    } else {
      toast('未能识别：' + ((r && r.error) || '该网站暂不支持自动识别'), 6000);
    }
  };
  const siteInput = $('#siteInput');
  if (siteInput) siteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (siteAdd) siteAdd.click(); }
  });

  const rowsEl = $('#srcRows');
  const rerender = () => { const el = $('#srcRows'); if (el) el.innerHTML = sourceRowsHtml(); };

  rowsEl.onchange = async (e) => {
    const t = e.target.closest('[data-src-on]');
    if (!t) return;
    const id = t.dataset.srcOn;
    const i = state.enabled.indexOf(id);
    if (t.checked && i < 0) state.enabled.push(id);
    if (!t.checked && i >= 0) state.enabled.splice(i, 1);
    await API.saveSettings({ enabledSources: state.enabled });
    renderSourceChips();
  };

  rowsEl.onclick = async (e) => {
    const del = e.target.closest('[data-src-del]');
    if (!del) return;
    const id = del.dataset.srcDel;
    if (!window.confirm('删除这个自定义源？')) return;
    const r = await API.deleteSource(id);
    if (r && r.ok) {
      state.enabled = state.enabled.filter(x => x !== id);
      await API.saveSettings({ enabledSources: state.enabled });
      await refreshSources();
      rerender();
      toast('已删除');
    } else {
      toast((r && r.error) || '删除失败');
    }
  };

  const afterImport = async (r) => {
    if (r && r.ok) {
      if (r.id && !state.enabled.includes(r.id)) state.enabled.push(r.id);
      await API.saveSettings({ enabledSources: state.enabled });
      await refreshSources();
      rerender();
      const nm = r.name || r.id;
      toast('已导入「' + nm + '」，后台检测中…', 2200);

      // 后台静默适配：自动跑一次健康检查，结果用右下角小提示回报
      try {
        const h = await API.health([r.id], '鬼灭');
        const res = h && (Array.isArray(h.res) ? h.res[0] : null) || (h && h.health && h.health[r.id]) || null;
        const ok = res ? res.ok : !!(h && h.ok);
        const cnt = res && res.count;
        if (ok) {
          toast('「' + nm + '」已适配可用' + (cnt ? '（' + cnt + ' 条结果）' : ''), 3000);
        } else {
          toast('「' + nm + '」已导入，但暂时无返回内容' + (res && res.error ? '：' + res.error : ''), 4200);
        }
      } catch (e) {
        // 静默失败，不影响导入结果
      }
    } else {
      toast('导入失败：' + ((r && r.error) || '未知错误'), 5000);
    }
  };

  $('#srcImportFile').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,text/javascript,application/javascript';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const r = await API.importSource(f.name.replace(/\.js$/i, ''), String(reader.result || ''));
        await afterImport(r);
      };
      reader.readAsText(f);
    };
    input.click();
  };

  const urlRow = () => $('#srcUrlRow');
  const urlInput = () => $('#srcUrlInput');

  $('#srcImportUrl').onclick = () => {
    const row = urlRow();
    if (!row) return;
    const shown = row.style.display !== 'none';
    row.style.display = shown ? 'none' : 'flex';
    if (!shown) {
      const inp = urlInput();
      if (inp) { inp.value = ''; inp.focus(); }
    }
  };
  $('#srcUrlCancel').onclick = () => { const row = urlRow(); if (row) row.style.display = 'none'; };
  $('#srcUrlGo').onclick = async () => {
    const inp = urlInput();
    const url = (inp && inp.value || '').trim();
    if (!/^https?:\/\//i.test(url)) { toast('请输入以 http(s):// 开头的链接'); if (inp) inp.focus(); return; }
    toast('下载中…', 1500);
    const r = await API.importSourceUrl(url, '');
    await afterImport(r);
  };
  if (urlInput()) urlInput().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#srcUrlGo').click(); }
  });

  $('#srcCheck').onclick = async () => {
    const btn = $('#srcCheck');
    btn.disabled = true;
    btn.textContent = '检测中…';
    let res = [];
    try { res = await API.health(state.sources.map(x => x.id)); } catch (e) { res = []; }
    for (const r of (res || [])) state.health[r.id] = { ok: r.ok, count: r.count, error: r.error, at: Date.now() };
    rerender();
    renderSourceChips();
    btn.disabled = false;
    btn.textContent = '重新检测';
    toast('检测完成：' + (res || []).filter(x => x.ok).length + '/' + (res || []).length + ' 可用');
  };
}

/* ---------------- 主题与背景 ---------------- */
const THEME_KEY = 'mji-theme';
const BG_KEY = 'mji-bg';

function applyTheme(mode) {
  const m = mode === 'light' ? 'light' : 'night';
  document.documentElement.dataset.theme = m;
  try { localStorage.setItem(THEME_KEY, m); } catch (e) { }
  const btn = $('#themeBtn');
  if (btn) btn.title = m === 'light' ? '切换到夜间模式' : '切换到日间模式';
}

function applyCustomBg(url) {
  const root = document.documentElement;
  if (url) root.style.setProperty('--bg-custom', 'url("' + url + '")');
  else root.style.removeProperty('--bg-custom');
}

function pickBackground() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) { toast('请选择图片文件'); return; }
      toast('正在保存背景…', 1200);
      const r = await API.saveBg(dataUrl);
      if (r && r.ok) {
        applyCustomBg(r.url);
        try { localStorage.setItem(BG_KEY, r.url); } catch (e) { }
        toast('背景已更换');
      } else {
        toast('背景保存失败');
      }
    };
    reader.readAsDataURL(f);
  };
  input.click();
}

function resetBackground() {
  applyCustomBg('');
  try { localStorage.removeItem(BG_KEY); } catch (e) { }
  toast('已恢复默认背景');
}

/* ---------------- 事件绑定 ---------------- */
function bindGlobal() {
  const view = $('#view');

  // 图片加载状态（load/error 不冒泡，用捕获监听）
  view.addEventListener('load', (e) => {
    if (e.target.tagName === 'IMG') e.target.classList.add('loaded');
  }, true);
  view.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') e.target.style.display = 'none';
  }, true);

  view.addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      if (a === 'settings') openSettings();
      else if (a === 'sources') openSourceManager();
      else if (a === 'clear-history') clearHistory();
      return;
    }
    const card = e.target.closest('.card');
    if (card) {
      const src = card.dataset.src;
      const id = card.dataset.id;
      if (src && id) openDetail(src, id);
      return;
    }
    const chip = e.target.closest('[data-chip-src]');
    if (chip) {
      const id = chip.dataset.chipSrc;
      const i = state.enabled.indexOf(id);
      if (i >= 0 && state.enabled.length > 1) state.enabled.splice(i, 1); else if (i < 0) state.enabled.push(id);
      API.saveSettings({ enabledSources: state.enabled });
      renderSourceChips();
      renderHome();
    }
  });

  $$('.rail-btn[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
  $('#settingsBtn').onclick = openSettings;

  // 窗口控制
  const setMaxIcon = (max) => {
    const b = $('#winMax');
    if (!b) return;
    b.title = max ? '还原' : '最大化';
    b.innerHTML = max
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 9.2c2.1-.2 4.2-.2 6.3 0 .2 2.1.2 4.2 0 6.3-2.1.2-4.2.2-6.3 0-.2-2.1-.2-4.2 0-6.3z"/><path d="M6.9 6.9c3.4-.3 6.8-.3 10.2 0"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.2 7.6c3.2-.2 6.4-.2 9.6 0 .2 3.1.2 6.2 0 9.3-3.2.2-6.4.2-9.6 0-.2-3.1-.2-6.2 0-9.3z"/></svg>`;
  };
  $('#winMin').onclick = () => API.winMin();
  $('#winMax').onclick = () => API.winMax();
  $('#winClose').onclick = () => API.winClose();
  if (API.onWinState) API.onWinState((s) => {
    const max = !!(s && s.maximized);
    document.body.classList.toggle('maximized', max);
    setMaxIcon(max);
  });
  if (API.onHealthUpdate) API.onHealthUpdate((s) => {
    state.health = (s && s.health) || state.health;
    renderSourceChips();
  });
  if (API.isMax) API.isMax().then((m) => { document.body.classList.toggle('maximized', !!m); setMaxIcon(!!m); }).catch(() => { });

  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'night';
    applyTheme(cur === 'light' ? 'night' : 'light');
  };

  // 顶栏刷新
  async function refreshCurrent() {
    const route = state.route;
    try {
      if (route === 'home') { await renderHome(); }
      else if (route === 'search' && state.searchQuery) { await doSearch(state.searchQuery); }
      else if (route === 'discover') { await loadDiscoverPage(true); }
      else if (route === 'schedule') { await renderSchedule(true); }
      else if (route === 'fav') { await renderFavorites(); }
      else if (route === 'history') { await renderHistory(); }
      else if (state.detail) { await openDetail(state.detail.sourceId, state.detail.id); }
      else { await renderHome(); }
      toast('已刷新', 1200);
    } catch (e) {
      toast('刷新失败：' + (e.message || e), 2500);
    }
  }
  const rf = $('#refreshBtn');
  if (rf) rf.onclick = refreshCurrent;

  $('#goSearch').onclick = () => doSearch($('#q').value);
  $('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch($('#q').value); }
    if (e.key === 'Escape') { $('#q').blur(); }
  });
}

/* ---------------- 启动 ---------------- */
async function boot() {
  const info = await API.info();
  state.sources = info.sources || [];
  state.settings = info.settings || {};
  state.health = info.health || {};
  state.enabled = (state.settings.enabledSources || ['lanerc']).filter(id => state.sources.some(s => s.id === id));
  if (!state.enabled.length && state.sources.length) state.enabled = [state.sources[0].id];
  const store = await API.getStore();
  state.store = store || { favorites: [], history: [] };

  // 恢复主题与自定义背景
  let savedTheme = 'night';
  let savedBg = '';
  try {
    savedTheme = localStorage.getItem(THEME_KEY) || 'night';
    savedBg = localStorage.getItem(BG_KEY) || '';
  } catch (e) { }
  applyTheme(savedTheme);
  if (savedBg) applyCustomBg(savedBg);

  bindGlobal();
  bindPlayer();
  go('home');
  maybeShowNotice();
}

/* ---------------- 更新公告 ---------------- */
const NOTICE_VERSION = '1.0.4';
const NOTICE_ITEMS = [
  '次元城支持账号登录，并打通播放地址获取',
  '设置新增「播放源账号」，可快速添加、修改或清除各内容源的账号',
  '播放时遇到需要登录的源，会自动弹出登录窗口，登录后自动续播',
  '登录凭据按内容源独立加密保存，下次启动自动登录',
  '导入内容源后自动在后台检测是否可用',
  '提示消息统一移到底部右侧，并自动收起',
  '修复首页重复加载问题',
  '修正设置页版本号显示',
  '开源地址与下载：<a href="https://github.com/dashang39/m-" target="_blank">github.com/dashang39/m-</a>',
  '移除了HIM'
];

function showUpdateNotice() {
  // 用空标题打开弹窗，标题改由正文自己排版（居中加粗）
  openModal('', `
    <div class="notice-title">更新公告</div>
    <div class="notice-meta">
      <span class="notice-ver">V${NOTICE_VERSION}</span>
      <span class="notice-sub">本次更新内容</span>
    </div>
    <ol class="notice-list">
      ${NOTICE_ITEMS.map(t => '<li>' + (/<a href="https:\/\/github\.com\/dashang39\/m-"/.test(t) ? t : esc(t)) + '</li>').join('')}
    </ol>
    <div class="notice-foot">
      <button class="btn btn-primary" id="noticeOk">知道了</button>
    </div>
  `);
  const ok = $('#noticeOk');
  if (ok) ok.onclick = async () => {
    closeModal();
    try {
      state.store.noticeSeen = NOTICE_VERSION;
      await API.saveStore(state.store);
    } catch (e) { }
  };
}

async function maybeShowNotice() {
  const seen = state.store && state.store.noticeSeen;
  if (seen === NOTICE_VERSION) return;
  setTimeout(showUpdateNotice, 600);
}



boot().catch(e => {
  console.error(e);
  document.body.innerHTML = `<div class="empty"><div class="big">💥</div><div>启动失败：${esc(e.message || e)}</div></div>`;
});
