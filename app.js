/* 医学生实训笔记助手 —— 主逻辑（本地优先 PWA） */
(function () {
  'use strict';
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  // ---------------- 工具函数 ----------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  // 药物名归一化：去括号内容、空格、连字符，转小写，用于模糊匹配
  function normDrug(s) { return String(s || '').toLowerCase().replace(/[（()）\s\-·]/g, ''); }
  function drugMatch(dbName, q) {
    const a = normDrug(dbName), b = normDrug(q);
    return !!a && !!b && (a.includes(b) || b.includes(a));
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  // 间隔复习（莱特纳盒子）：盒号 1→5 对应下次复习间隔 0/1/3/7/16 天
  function dueOf(box) { const d = [0, 0, 1, 3, 7, 16]; return Date.now() + (d[box] || 0) * 86400000; }
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }
  function compressImage(file, max) {
    max = max || 1024;
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const sc = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          res(c.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  async function fileToDataURL(file) { return compressImage(file, 1280); }
  // 由 dataURL 生成更小的缩略图（用于图谱网格，省流量）
  function resizeDataURL(src, max, q) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', q || 0.72));
      };
      img.onerror = () => res(src);
      img.src = src;
    });
  }

  // ---------------- 数据初始化（首次播种内置内容） ----------------
  async function ensureSeed() {
    // 复习库示例题库：首次（library 为空）自动载入，供先看样例再自建
    if ((await DB.count('library')) === 0 && SEED.LIB && SEED.LIB.length) {
      await DB.bulk('library', SEED.LIB.map((x) => ({ ...x, createdAt: Date.now() })));
      await DB.put('meta', { key: 'libDemo', value: 1 });
    }
  }

  // 手动载入示例题库（清空后再看样例时用）
  async function loadLibDemo() {
    if (!SEED.LIB || !SEED.LIB.length) return;
    if ((await DB.count('library')) > 0) { toast('题库已有内容，未重复载入'); return; }
    await DB.bulk('library', SEED.LIB.map((x) => ({ ...x, createdAt: Date.now() })));
    await DB.put('meta', { key: 'libDemo', value: 1 });
  }

  // ---------------- 顶部与导航 ----------------
  const TITLES = {
    lib: ['复习库', '导入题库 · 刷题 · AI 考点分析'], me: ['我的', '设置与关于']
  };
  function header(title, sub) {
    return `<header class="top"><div><h1>${esc(title)}</h1><div class="sub">${esc(sub || '')}</div></div></header>`;
  }
  function setNav(active) {
    document.querySelectorAll('#nav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-nav') === active);
    });
  }
  function fab(html) { return `<div class="fab" id="fab">${html || '+'}</div>`; }

  // ---------------- 路由 ----------------
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const p = raw.split('/').filter(Boolean);
    const base = p[0] || 'lib';
    return { base, a: p[1], b: p[2], c: p[3] };
  }
  function go(hash) { location.hash = hash; }

  async function route() {
    const { base, a, b, c } = parseHash();
    try {
      if (base === 'lib') {
        setNav('lib');
        if (a === 'cat') {
          if (b === 'new' || b === 'edit') await renderLibCatForm(b === 'edit' ? c : null);
          else if (b) await renderLibCat(b);
          else go('#/lib');
        } else if (a === 'item') {
          if (b === 'new') await renderLibItemForm(null, c);
          else if (b === 'edit') await renderLibItemForm(c, null);
          else go('#/lib');
        } else if (a === 'quiz') { await renderLibQuiz(b); }
        else if (a === 'import') { await renderLibImport(); }
        else if (a === 'drill') { await renderLibDrill(b, c); }
        else if (a === 'ai') { await renderLibAI(b, c); }
        else { await renderLib(); }
      }
      else if (base === 'auth') { setNav('me'); await renderAuth(); }
      else if (base === 'me') { setNav('me'); if (a === 'ai') await renderAISettings(); else renderMe(); }
      else { setNav('lib'); await renderLib(); }
    } catch (e) {
      const storeMissing = /object ?store|not found/i.test(e.message || '');
      app.innerHTML =
        `<div class="empty"><div class="big">⚠️</div><p>出错了：${esc(e.message)}</p>` +
        (storeMissing
          ? `<p class="muted" style="font-size:13px;margin-top:6px">本地数据库缺少新版存储（通常是缓存未更新或旧页面仍占用）。点下面按钮修复即可，已有数据不会丢。</p>
             <button class="btn-ghost" id="fixdb" style="margin-top:12px">修复本地数据库并重试</button>`
          : '') +
        `</div>` + navFooter();
      const fx = document.getElementById('fixdb');
      if (fx)
        fx.onclick = async () => {
          fx.disabled = true;
          fx.textContent = '正在修复…';
          try {
            await repairLocalDB();
            toast('已修复，正在重新载入…');
            setTimeout(() => location.reload(), 600);
          } catch (err) {
            toast('修复失败：' + (err && err.message ? err.message : err));
            fx.disabled = false;
            fx.textContent = '再试一次';
          }
        };
    }
    window.scrollTo(0, 0);
  }
  function navFooter() { return ''; }

  // 抢救用：直接用原生 IndexedDB 把代码需要的存储补全（不依赖已加载的 db.js 版本）
  function repairLocalDB() {
    const need = (typeof DB !== 'undefined' && DB.STORES) || [
      'library', 'meta'
    ];
    const NAME = 'examdrill_notes';
    const kpOf = (s) => (s === 'meta' ? 'key' : 'id');
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME);
      r.onerror = () => reject(r.error || new Error('打不开本地数据库'));
      r.onsuccess = () => {
        const db = r.result;
        const missing = need.filter((s) => !db.objectStoreNames.contains(s));
        if (!missing.length) { db.close(); resolve(true); return; }
        const next = db.version + 1;
        db.close();
        const r2 = indexedDB.open(NAME, next);
        r2.onupgradeneeded = (e) => {
          const d = e.target.result;
          need.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: kpOf(s) }); });
        };
        r2.onblocked = () => reject(new Error('数据库被其它窗口占用，请关掉其它标签/后台 App 后重试'));
        r2.onerror = () => reject(r2.error || new Error('升级失败'));
        r2.onsuccess = () => { r2.result.close(); resolve(true); };
      };
    });
  }

  // ---------------- 复习库（独立模块：学科分类 + 自建题库 + 抽卡复习） ----------------
  async function renderLib() {
    const all = await DB.getAll('library');
    const cats = all.filter((x) => x.type === 'cat');
    const items = all.filter((x) => x.type === 'item');
    app.innerHTML = header('Kaodiantong 考点通 V1.0', '智能刷题与押题 · 离线 PWA') +
      `<div class="container">
        <div class="row" style="gap:8px;margin-bottom:10px">
          <button class="btn-primary btn-sm" id="import" style="flex:1">📥 导入题库</button>
        </div>
        <div class="muted" style="margin:2px 0 10px">按学科建分类（如 药理学 / 内科 / 外科 / 有机化学考研），可导入自己的题库文档，刷题、看考频、让 AI 押题。数据存本机，登录后随账号同步。</div>
        <div class="grid2" id="grid"></div>
      </div>` + fab('+');
    document.getElementById('import').onclick = () => go('#/lib/import');
    const grid = document.getElementById('grid');
    if (cats.length === 0) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/3"><div class="big">📚</div><p>还没有分类，点右下角 ＋ 新建学科分类</p>
        <p class="muted" style="font-size:12px;margin-top:6px">已有题库文档？直接点上方 <b>📥 导入题库</b>，会自动建好分类</p>
        <button class="btn-ghost" id="loadDemo" style="margin-top:12px">载入示例题库看看</button></div>`;
      const d = document.getElementById('loadDemo');
      if (d) d.onclick = async () => { d.disabled = true; d.textContent = '正在载入…'; await loadLibDemo(); toast('已载入示例题库'); renderLib(); };
    } else {
      grid.innerHTML = cats.map((c) => {
        const n = items.filter((i) => i.catId === c.id).length;
        return `<div class="tile" data-id="${c.id}" style="text-align:left">
          ${c.cover ? `<img src="${c.cover}" style="width:100%;height:90px;object-fit:cover;border-radius:10px;margin-bottom:8px">` : `<div style="height:90px;border-radius:10px;background:#eef3f7;display:flex;align-items:center;justify-content:center;font-size:32px;margin-bottom:8px">📂</div>`}
          <div class="t" style="font-size:16px">${esc(c.name)}</div>
          <div class="d">${n} 题 ${c.desc ? '· ' + esc(c.desc) : ''}</div>
          <div class="row" style="margin-top:10px;gap:8px">
            <button class="btn-primary btn-sm" data-quiz="${c.id}" style="flex:1">复习</button>
            <button class="btn-ghost btn-sm" data-edit="${c.id}" style="flex:1">编辑</button>
          </div>
        </div>`;
      }).join('');
      grid.querySelectorAll('[data-id]').forEach((el) => el.onclick = (ev) => {
        if (ev.target.closest('[data-quiz]') || ev.target.closest('[data-edit]')) return;
        go(`#/lib/cat/${el.getAttribute('data-id')}`);
      });
      grid.querySelectorAll('[data-quiz]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); go(`#/lib/quiz/${b.getAttribute('data-quiz')}`); });
      grid.querySelectorAll('[data-edit]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); go(`#/lib/cat/edit/${b.getAttribute('data-edit')}`); });
    }
    document.getElementById('fab').onclick = () => go('#/lib/cat/new');
  }

  async function renderLibCatForm(id) {
    let c = { name: '', desc: '', cover: '' };
    if (id) { const f = await DB.get('library', id); if (f) c = f; }
    let cover = c.cover || '';
    app.innerHTML = header(id ? '编辑分类' : '新建学科分类', '') +
      `<div class="container"><div class="card">
        <input id="c-name" placeholder="分类名称（如：药理学）" value="${esc(c.name)}">
        <input id="c-desc" placeholder="简短说明（如：作用于 CNS 的药物）" value="${esc(c.desc)}">
        <div class="section-title">封面（可选 · 仅限图片）</div>
        <input type="file" id="c-cover" accept="image/*">
        <div class="muted" style="font-size:12px">这里选的是分类的<b>封面图片</b>（jpg / png），<b>不是题库文档</b>。<br>要导入题库：返回题库首页 → 点顶部「📥 导入题库」。</div>
        <div class="photo-grid" id="c-prev" style="margin-top:8px">${cover ? `<div><img src="${cover}"></div>` : ''}</div>
        <button class="btn-primary" id="c-save">保存</button>
        ${id ? '<button class="btn-danger" id="c-del" style="width:100%;margin-top:8px">删除该分类（含其题目）</button>' : ''}
        <button class="btn-ghost" id="c-back" style="width:100%;margin-top:8px">返回</button>
      </div></div>`;
    const prev = document.getElementById('c-prev');
    document.getElementById('c-cover').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!/^image\//i.test(f.type || '')) {
        toast('封面只能选图片（jpg / png）——题库文档请用「📥 导入题库」');
        e.target.value = '';
        return;
      }
      try { cover = await fileToDataURL(f); prev.innerHTML = `<div><img src="${cover}"></div>`; } catch (_) {}
      e.target.value = '';
    };
    document.getElementById('c-save').onclick = async () => {
      const name = document.getElementById('c-name').value.trim();
      if (!name) { toast('请填写分类名称'); return; }
      const data = { id: c.id || uid('cat'), type: 'cat', name, desc: document.getElementById('c-desc').value.trim(), cover, createdAt: c.createdAt || Date.now() };
      await DB.put('library', data);
      toast('已保存'); go('#/lib');
    };
    if (id) document.getElementById('c-del').onclick = async () => {
      if (confirm('删除该分类会同时删除其下全部题目，确定？')) {
        const its = (await DB.getAll('library')).filter((x) => x.type === 'item' && x.catId === id);
        for (const it of its) await DB.del('library', it.id);
        await DB.del('library', id);
        toast('已删除'); go('#/lib');
      }
    };
    document.getElementById('c-back').onclick = () => go('#/lib');
  }

  async function renderLibCat(catId) {
    const cat = await DB.get('library', catId);
    if (!cat) { go('#/lib'); return; }
    const all = await DB.getAll('library');
    let items = all.filter((x) => x.type === 'item' && x.catId === catId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    app.innerHTML = header(cat.name, cat.desc || '分类题库') +
      `<div class="container">
        <div class="row" style="gap:8px;margin-bottom:8px">
          <button class="btn-primary btn-sm" id="drill" style="flex:1">📝 刷题（${items.length}）</button>
          <button class="btn-ghost btn-sm" id="quiz" style="flex:1">▶ 间隔复习</button>
        </div>
        <div class="row" style="gap:8px;margin-bottom:10px">
          <button class="btn-ghost btn-sm" id="ai" style="flex:1">🤖 AI 考点分析</button>
          <button class="btn-ghost btn-sm" id="predict" style="flex:1">🎯 AI 押题</button>
        </div>
        <button class="btn-ghost" id="add" style="width:100%;margin-bottom:10px">➕ 添加题目</button>
        <div id="list"></div>
      </div>` + fab('+');
    const list = document.getElementById('list');
    function draw() {
      if (items.length === 0) { list.innerHTML = `<div class="empty"><div class="big">📝</div><p>还没有题目，点右下角 ＋ 添加</p></div>`; return; }
      list.innerHTML = items.map((it) => `<div class="list-item" data-id="${it.id}">
        <div class="grow">
          <div class="tt">${esc(it.question || '(未命名题目)')}</div>
          <div class="mm">${it.photos && it.photos.length ? '🖼 ' + it.photos.length + ' 张图 · ' : ''}第 ${it.box || 1} 盒</div>
        </div>
        <button class="icon-btn del" data-del="${it.id}" title="删除">🗑</button>
        <div class="muted chev">›</div>
      </div>`).join('');
      list.querySelectorAll('[data-id]').forEach((el) => el.onclick = () => go(`#/lib/item/edit/${el.getAttribute('data-id')}`));
      list.querySelectorAll('[data-del]').forEach((b) => b.onclick = async (e) => {
        e.stopPropagation();
        if (confirm('删除这道题目？')) { await DB.del('library', b.getAttribute('data-del')); toast('已删除'); items = items.filter((x) => x.id !== b.getAttribute('data-del')); draw(); }
      });
    }
    draw();
    document.getElementById('quiz').onclick = () => go(`#/lib/quiz/${catId}`);
    document.getElementById('drill').onclick = () => go(`#/lib/drill/${catId}/all`);
    document.getElementById('ai').onclick = () => go(`#/lib/ai/${catId}/analyze`);
    document.getElementById('predict').onclick = () => go(`#/lib/ai/${catId}/predict`);
    document.getElementById('add').onclick = () => go(`#/lib/item/new/${catId}`);
    document.getElementById('fab').onclick = () => go(`#/lib/item/new/${catId}`);
  }

  async function renderLibItemForm(id, catId) {
    let it = { question: '', answer: '', catId: catId || '', photos: [], box: 1, due: Date.now() };
    if (id) { const f = await DB.get('library', id); if (f) it = f; }
    if (!it.catId) { toast('缺少所属分类'); go('#/lib'); return; }
    let tmpPhotos = it.photos ? it.photos.slice() : [];
    const cat = await DB.get('library', it.catId);
    app.innerHTML = header(id ? '编辑题目' : '新建题目', cat ? cat.name : '') +
      `<div class="container"><div class="card">
        <textarea id="q" placeholder="题目 / 知识点（如：阿托品的药理作用？）" style="min-height:80px">${esc(it.question)}</textarea>
        <textarea id="a" placeholder="答案 / 解析（支持多行）" style="min-height:140px">${esc(it.answer)}</textarea>
        <div class="section-title">配图（可选，可多张）</div>
        <input type="file" id="p" accept="image/*" capture="environment" multiple>
        <div class="photo-grid" id="prev" style="margin-top:8px"></div>
        <button class="btn-primary" id="save">保存</button>
        ${id ? '<button class="btn-danger" id="del" style="width:100%;margin-top:8px">删除此题</button>' : ''}
        <button class="btn-ghost" id="back" style="width:100%;margin-top:8px">返回</button>
      </div></div>`;
    const prev = document.getElementById('prev');
    function renderPreviews() {
      prev.innerHTML = tmpPhotos.map((p, i) => `<div style="position:relative"><img src="${p}" alt=""><div class="badge b-danger" style="position:absolute;top:2px;right:2px;cursor:pointer" data-rm="${i}">✕</div></div>`).join('');
      prev.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { tmpPhotos.splice(+b.getAttribute('data-rm'), 1); renderPreviews(); });
    }
    renderPreviews();
    document.getElementById('p').onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) { try { tmpPhotos.push(await fileToDataURL(f)); } catch (_) {} }
      renderPreviews(); e.target.value = '';
    };
    document.getElementById('save').onclick = async () => {
      const q = document.getElementById('q').value.trim();
      if (!q) { toast('请填写题目'); return; }
      const data = {
        id: it.id || uid('item'), type: 'item', catId: it.catId,
        question: q, answer: document.getElementById('a').value,
        photos: tmpPhotos, box: it.box || 1, due: it.due || Date.now(),
        createdAt: it.createdAt || Date.now()
      };
      await DB.put('library', data);
      toast('已保存'); go(`#/lib/cat/${it.catId}`);
    };
    if (id) document.getElementById('del').onclick = async () => {
      if (confirm('删除这道题目？')) { await DB.del('library', id); toast('已删除'); go(`#/lib/cat/${it.catId}`); }
    };
    document.getElementById('back').onclick = () => go(`#/lib/cat/${it.catId}`);
  }

  async function renderLibQuiz(catId) {
    const cat = await DB.get('library', catId);
    if (!cat) { go('#/lib'); return; }
    const items = (await DB.getAll('library')).filter((x) => x.type === 'item' && x.catId === catId);
    if (items.length === 0) {
      app.innerHTML = header(cat.name, '复习') + `<div class="container"><div class="empty"><div class="big">📝</div><p>该分类还没有题目</p></div><button class="btn-ghost" id="back" style="width:100%">返回</button></div>`;
      document.getElementById('back').onclick = () => go(`#/lib/cat/${catId}`); return;
    }
    const due = items.filter((c) => (c.due || 0) <= Date.now());
    const queue = (due.length ? due : items).slice();
    app.innerHTML = header('复习 · ' + cat.name, `共 ${items.length} 题 · 待复习 ${due.length} 题`) + `<div class="container" id="rv"></div>`;
    const box = document.getElementById('rv');
    if (queue.length === 0) { box.innerHTML = `<div class="empty"><div class="big">🎉</div><p>暂无可复习题目</p></div>`; return; }
    let i = 0;
    function show() {
      if (i >= queue.length) {
        box.innerHTML = `<div class="empty"><div class="big">✅</div><p>本轮复习完成！</p><button class="btn-ghost" id="again" style="width:100%">再来一轮</button></div>`;
        document.getElementById('again').onclick = () => renderLibQuiz(catId);
        return;
      }
      const c = queue[i];
      const imgs = (c.photos || []).map((p) => `<img src="${p}" style="width:100%;border-radius:8px;margin-top:8px;max-height:220px;object-fit:contain">`).join('');
      box.innerHTML = `<div class="card">
        <div class="quiz-card">${esc(c.question)}</div>
        ${imgs ? '<div id="imgs" style="display:none">' + imgs + '</div>' : ''}
        <button class="btn-ghost" id="rev" style="width:100%">显示答案</button>
        <div id="ans" style="display:none;margin-top:12px" class="card">${nl2br(c.answer)}</div>
        <div id="ctr" style="display:none;margin-top:10px" class="row">
          <button class="btn-danger btn-sm" id="forget" style="flex:1">忘了</button>
          <button class="btn-primary btn-sm" id="know" style="flex:1">记得</button>
        </div>
        <div class="muted" style="text-align:center;margin-top:8px">${i + 1} / ${queue.length}</div>
      </div>`;
      document.getElementById('rev').onclick = () => {
        document.getElementById('ans').style.display = 'block';
        const im = document.getElementById('imgs'); if (im) im.style.display = 'block';
        document.getElementById('ctr').style.display = 'flex';
      };
      document.getElementById('forget').onclick = async () => { c.box = 1; c.due = Date.now(); await DB.put('library', c); i++; show(); };
      document.getElementById('know').onclick = async () => { c.box = Math.min(5, (c.box || 1) + 1); c.due = dueOf(c.box); await DB.put('library', c); i++; show(); };
    }
    show();
  }

  // ---- 题库文档解析（txt / md / csv / pdf / docx）----
  // 章节标题行，如「单选题（80题）」「多选题 (10题)」——解析前剔除，避免混入答案
  const SECTION_RE = /^\s*[\u4e00-\u9fa5A-Za-z]{2,10}\s*[（(]\s*\d+\s*题\s*[)）]\s*$/;
  function isCSV(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    const head = lines[0].toLowerCase();
    if (/question|题目|题干/.test(head) && /answer|答案/.test(head)) return true;
    const mode = lines[0].split(',').length;
    if (mode < 2) return false;
    return lines.filter((l) => l.split(',').length === mode).length > lines.length * 0.6;
  }
  function parseCSVBank(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    const cols = lines.shift().toLowerCase().split(',').map((s) => s.trim());
    const qi = cols.findIndex((c) => /question|题目|题干/.test(c));
    const ai = cols.findIndex((c) => /answer|答案|解析/.test(c));
    const oi = cols.findIndex((c) => /option|选项/.test(c));
    const out = [];
    for (const ln of lines) {
      const p = ln.split(',');
      let q = qi >= 0 ? p[qi] : p[0];
      let a = ai >= 0 ? p[ai] : (p[1] || '');
      if (oi >= 0 && p[oi]) q = q + '\n' + p[oi];
      if (q && q.trim()) out.push({ question: q.trim(), answer: (a || '').trim() });
    }
    return out;
  }
  function splitQA(block) {
    const ansRe = /(?:^|\n)\s*(?:答案|答\s*案|解析|标准答案|参考答案|正确选项|解答)\s*[:：]?\s*/;
    const am = block.split(ansRe);
    if (am.length >= 2) {
      return { q: am[0].trim(), a: am.slice(1).join('').trim() };
    }
    const qa = block.match(/^(问|题|Q)[:：]([\s\S]*?)\n(答|案|A)[:：]([\s\S]*)$/i);
    if (qa) return { q: qa[2].trim(), a: qa[4].trim() };
    return { q: block.trim(), a: '' };
  }
  function parseQABank(text) {
    text = (text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    // 逐行去首尾空白 + 剔除「单选题（80题）」这类章节标题行
    text = text.split('\n')
      .filter((l) => !SECTION_RE.test(l))
      .map((l) => l.trim())
      .join('\n').trim();
    if (!text) return [];
    if (isCSV(text)) return parseCSVBank(text);
    let chunks = text.split(/(?=\n\s*(?:问|题|Q)[:：])/i);
    if (chunks.length <= 1) chunks = text.split(/\n(?=\s*\d+[\.、)．]\s*)/);
    if (chunks.length <= 1) {
      // 仅当能切成 ≥2 段时才用「空行分隔」；否则整篇会被当成 1 道伪题目（选中非题库文档时的典型症状）
      const byBlank = text.split(/\n\s*\n/).filter((x) => x.trim());
      if (byBlank.length >= 2) chunks = byBlank;
    }
    const out = [];
    for (let blk of chunks) {
      blk = blk.replace(/^\s*\d+[\.、)．]\s*/, '').trim();
      if (!blk) continue;
      const { q, a } = splitQA(blk);
      if (q && q.length >= 2) out.push({ question: q, answer: a });
    }
    return out;
  }
  let _pdfLoading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (_pdfLoading) return _pdfLoading;
    _pdfLoading = new Promise((resolve, reject) => {
      const v = '3.11.174';
      const s = document.createElement('script');
      s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.min.js`;
      s.onload = () => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.worker.min.js`;
        resolve();
      };
      s.onerror = () => reject(new Error('PDF 解析库加载失败（请检查网络）'));
      document.head.appendChild(s);
    });
    return _pdfLoading;
  }
  async function extractPdfText(file) {
    await loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let s = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      s += tc.items.map((i) => i.str).join(' ') + '\n\n';
    }
    return s;
  }

  // ---- 导入题库 ----
  async function renderLibImport() {
    const cats = (await DB.getAll('library')).filter((x) => x.type === 'cat');
    app.innerHTML = header('导入题库', '支持 txt / md / csv / pdf / docx（文档形式题库）') +
      `<div class="container"><div class="card">
        <div class="section-title">① 选择题库文件</div>
        <input type="file" id="f" multiple>
        <div class="muted" style="font-size:12px">支持 <b>.txt / .md / .csv / .pdf / .docx</b>。此处<b>不限制文件类型</b>（任何文件都能选中），选错格式会在下方给出提示，不会再点不动。可多选。</div>
        <div id="preview" style="margin-top:10px"></div>
        <div class="section-title" style="margin-top:12px">② 导入到分类</div>
        <select id="cat"><option value="">— 选择已有分类 —</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <input id="newcat" placeholder="或输入新分类名（如：有机化学考研）" style="margin-top:8px">
        <button class="btn-primary" id="imp" disabled style="margin-top:12px">先选择文件</button>
        <button class="btn-ghost" id="back" style="width:100%;margin-top:8px">返回</button>
      </div></div>`;
    let parsed = [];
    const prev = document.getElementById('preview');
    document.getElementById('f').onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      const btn = document.getElementById('imp');
      if (!files.length) { btn.disabled = true; btn.textContent = '先选择文件'; prev.innerHTML = ''; return; }
      btn.disabled = true; btn.textContent = '解析中…';
      try {
        parsed = [];
        const skipped = [];
        for (const f of files) {
          let txt;
          if (/\.pdf$/i.test(f.name)) txt = await extractPdfText(f);
          else if (/\.docx$/i.test(f.name)) {
            if (!window.DocxText) throw new Error('docx 解析模块未加载，请刷新页面后重试');
            txt = await DocxText.extractDocxText(f);
          } else if (/\.doc$/i.test(f.name)) {
            throw new Error('旧版 .doc 无法直接解析，请用 Word 另存为 .docx 或 .txt 后再导入');
          } else if (/\.(txt|md|csv)$/i.test(f.name)) txt = await f.text();
          else throw new Error(`「${f.name}」不是题库文档。本题库只认这五种格式：txt / md / csv / pdf / docx。`);
          const arr = parseQABank(txt);
          // 反误判①：源码 / 说明书类文档
          const nospace = txt.replace(/\s/g, '').length;
          const ansCount = arr.filter((x) => x.answer && x.answer.trim()).length;
          // 反误判②：整篇只析出 1~2 组、且一组答案都没有、正文又不短 → 是通知/散文，不是题库
          const suspicious = arr.length > 0 && arr.length <= 2 && ansCount === 0 && nospace >= 600;
          if (!arr.length || suspicious) {
            const head = txt.slice(0, 4000);
            if (/<!DOCTYPE html>|<div class=|function\s+\w+\s*\(|软件说明书|源程序/i.test(head)) {
              throw new Error(`「${f.name}」是网页源码 / 说明书类文档，里面没有题目，无法导入。请改选含「题干 + 答案」的题库文件。`);
            }
            if (suspicious) {
              throw new Error(`「${f.name}」不像题库：全文约 ${nospace} 字，既没有题号、也没识别出任何「答案：」。它可能是通知、说明或其它文档，请改选正确的题库文件。`);
            }
            skipped.push(f.name);
            continue;
          }
          parsed = parsed.concat(arr.map((x) => ({ ...x, src: f.name })));
        }
        if (!parsed.length) throw new Error('没从所选文件里识别出题目。请确认文件内容是「题干 + 答案」形式（例：\n1. 信息论的奠基者是谁？\n答案：香农）。');
        prev.innerHTML = `<div class="card" style="background:#eef7ee">已解析 <b>${parsed.length}</b> 道题（来自 ${files.length} 个文件）。${skipped.length ? `<br><span class="muted" style="font-size:12px">未识别出题目的文件：${skipped.map(esc).join('、')}</span>` : ''}</div>`;
        btn.disabled = false; btn.textContent = `导入 ${parsed.length} 题`;
      } catch (err) {
        prev.innerHTML = `<div class="card" style="background:#fdeeee">解析失败：${esc(err.message)}</div>`;
        btn.disabled = true; btn.textContent = '解析失败';
      }
    };
    document.getElementById('imp').onclick = async () => {
      if (!parsed.length) return;
      const catId = document.getElementById('cat').value;
      const catName = document.getElementById('newcat').value.trim();
      if (!catId && !catName) { toast('请选择或新建分类'); return; }
      const btn = document.getElementById('imp'); btn.disabled = true; btn.textContent = '导入中…';
      let cid = catId;
      if (!cid) { const c = { id: uid('cat'), type: 'cat', name: catName, desc: '导入题库', cover: '', createdAt: Date.now() }; await DB.put('library', c); cid = c.id; }
      const items = parsed.map((x) => ({ id: uid('item'), type: 'item', catId: cid, question: x.question, answer: x.answer, photos: [], box: 1, due: Date.now(), createdAt: Date.now(), stats: { times: 0, correct: 0, wrong: 0, src: x.src || '' } }));
      await DB.bulk('library', items);
      toast(`已导入 ${items.length} 题`); go(`#/lib/cat/${cid}`);
    };
    document.getElementById('back').onclick = () => go('#/lib');
  }

  // ---- 刷题模式（进度% / 乱序 / 错题本）----
  async function renderLibDrill(catId, mode) {
    mode = mode || 'all';
    const cat = await DB.get('library', catId);
    if (!cat) { go('#/lib'); return; }
    let items = (await DB.getAll('library')).filter((x) => x.type === 'item' && x.catId === catId);
    if (mode === 'wrong') items = items.filter((x) => (x.stats && x.stats.wrong > 0));
    if (mode === 'unseen') items = items.filter((x) => !(x.stats && x.stats.times > 0));
    if (items.length === 0) {
      app.innerHTML = header('刷题 · ' + cat.name, '') + `<div class="container"><div class="empty"><div class="big">📭</div><p>${mode === 'wrong' ? '没有错题' : mode === 'unseen' ? '没有未做过的题' : '该分类还没有题目'}</p></div><button class="btn-ghost" id="back" style="width:100%">返回</button></div>`;
      document.getElementById('back').onclick = () => go(`#/lib/cat/${catId}`); return;
    }
    const total = items.length;
    let order = 'seq', queue = items.slice(), i = 0, correct = 0, wrong = 0;
    app.innerHTML = header('刷题 · ' + cat.name, `共 ${total} 题`) +
      `<div class="container" id="dv">
        <div class="row" style="gap:8px;margin-bottom:10px">
          <button class="btn-ghost btn-sm" id="shuffle">🔀 切乱序</button>
          <button class="btn-ghost btn-sm" id="retry">🔁 仅错题</button>
          <button class="btn-ghost btn-sm" id="unseen">🌱 未做过</button>
        </div>
        <div class="progress"><div class="bar" id="bar" style="width:0%"></div></div>
        <div id="card"></div>
      </div>`;
    function shuffle(a) { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
    function buildQueue() { queue = order === 'shuffle' ? shuffle(items.slice()) : items.slice(); i = 0; correct = 0; wrong = 0; }
    function updateBar() { const bar = document.getElementById('bar'); if (bar) bar.style.width = Math.round((i / total) * 100) + '%'; }
    async function record(c, ok) {
      c.stats = c.stats || { times: 0, correct: 0, wrong: 0 };
      c.stats.times++; if (ok) c.stats.correct++; else c.stats.wrong++;
      await DB.put('library', c);
      if (ok) correct++; else wrong++;
    }
    function show() {
      if (i >= queue.length) { finish(); return; }
      const c = queue[i];
      const imgs = (c.photos || []).map((p) => `<img src="${p}" style="width:100%;border-radius:8px;margin-top:8px;max-height:220px;object-fit:contain">`).join('');
      document.getElementById('card').innerHTML = `<div class="card">
        <div class="quiz-card">${esc(c.question)}</div>
        ${imgs ? `<div id="imgs" style="display:none">${imgs}</div>` : ''}
        <button class="btn-ghost" id="rev" style="width:100%">显示答案</button>
        <div id="ans" style="display:none;margin-top:12px" class="card">${nl2br(c.answer || '(无答案)')}</div>
        <div id="ctr" style="display:none;margin-top:10px" class="row">
          <button class="btn-danger btn-sm" id="wrong" style="flex:1">答错</button>
          <button class="btn-primary btn-sm" id="right" style="flex:1">答对</button>
        </div>
        <div class="muted" style="text-align:center;margin-top:8px">${i + 1} / ${total}</div>
      </div>`;
      updateBar();
      document.getElementById('rev').onclick = () => { document.getElementById('ans').style.display = 'block'; const im = document.getElementById('imgs'); if (im) im.style.display = 'block'; document.getElementById('ctr').style.display = 'flex'; };
      document.getElementById('wrong').onclick = async () => { await record(c, false); i++; show(); };
      document.getElementById('right').onclick = async () => { await record(c, true); i++; show(); };
    }
    function finish() {
      const acc = total ? Math.round((correct / total) * 100) : 0;
      document.getElementById('card').innerHTML = `<div class="empty"><div class="big">✅</div><p>本轮完成</p><p class="muted">答对 ${correct} · 答错 ${wrong} · 正确率 ${acc}%</p>
        <button class="btn-primary" id="again" style="width:100%;margin-top:10px">再来一轮（乱序）</button>
        <button class="btn-ghost" id="back" style="width:100%;margin-top:8px">返回分类</button></div>`;
      document.getElementById('again').onclick = () => { order = 'shuffle'; buildQueue(); show(); };
      document.getElementById('back').onclick = () => go(`#/lib/cat/${catId}`);
    }
    document.getElementById('shuffle').onclick = () => { order = order === 'shuffle' ? 'seq' : 'shuffle'; toast(order === 'shuffle' ? '已切乱序' : '已切顺序'); };
    document.getElementById('retry').onclick = () => go(`#/lib/drill/${catId}/wrong`);
    document.getElementById('unseen').onclick = () => go(`#/lib/drill/${catId}/unseen`);
    buildQueue(); show();
  }

  // ---- AI 考点分析 / 押题 ----
  async function askAI(system, user) {
    const cfg = ((await DB.get('meta', 'aiConfig')) || {}).value || {};
    if (!cfg.endpoint || !cfg.apiKey) throw new Error('未配置 AI：请在「我的 → AI 设置」填入接口地址与密钥');
    const r = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model || 'glm-4.7-flash', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
    });
    if (!r.ok) throw new Error('AI 接口错误 ' + r.status);
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || j.content || JSON.stringify(j);
  }
  async function renderLibAI(catId, mode) {
    const cat = await DB.get('library', catId);
    if (!cat) { go('#/lib'); return; }
    const items = (await DB.getAll('library')).filter((x) => x.type === 'item' && x.catId === catId);
    const isPredict = mode === 'predict';
    app.innerHTML = header((isPredict ? '押题分析' : 'AI 考点分析') + ' · ' + cat.name, isPredict ? '导入往年卷越多，押题越准' : '考频 / 重点 / 扩展 / 关联') +
      `<div class="container"><div class="card" id="panel">
        <p class="muted">${isPredict ? '把历年真题导入同一分类（或命名「XX 往年卷」），AI 会比对考点分布，预测今年最可能考的题，并说明「押题率」。' : '将本分类题目交给 AI，分析考频最高的知识点、重点、可扩展考点，以及关联高校考研常见考法。'}</p>
        <button class="btn-primary" id="run">开始分析</button>
        <button class="btn-ghost" id="cfg" style="width:100%;margin-top:8px">AI 设置（填接口密钥）</button>
        <div id="out" style="margin-top:12px;white-space:pre-wrap;font-size:14px;line-height:1.7"></div>
      </div><button class="btn-ghost" id="back" style="width:100%;margin-top:8px">返回</button></div>`;
    document.getElementById('cfg').onclick = () => go('#/me/ai');
    document.getElementById('back').onclick = () => go(`#/lib/cat/${catId}`);
    document.getElementById('run').onclick = async () => {
      if (items.length === 0) { toast('该分类还没有题目'); return; }
      const btn = document.getElementById('run'); btn.disabled = true; btn.textContent = '分析中…（可能数十秒）';
      const out = document.getElementById('out'); out.textContent = '思考中…';
      try {
        const list = items.map((x, idx) => `${idx + 1}. 题：${x.question}\n   答：${x.answer || '(无)'}`).join('\n');
        const system = isPredict
          ? '你是考研/考公辅导专家。基于提供的历年真题题目，预测今年最可能出现的考点与具体题目方向。给出：① 高频必考知识点 Top 清单；② 今年可能新增/变化的考点；③ 预测 3-5 道「最像今年会考」的模拟题；④ 说明「押题率」含义（预测卷与实际试卷重合度）及提高方法。用中文、分点、可操作。'
          : '你是医学/考试辅导专家。基于题库存的题目，分析：① 考频最高的知识点；② 重点与难点；③ 可向外扩展的相关知识点；④ 关联高校考研/考公常见考法。用中文、分点、可操作。';
        const user = `分类：${cat.name}\n题目列表（共 ${items.length} 题）：\n${list}`;
        out.textContent = await askAI(system, user);
      } catch (err) { out.textContent = '⚠️ ' + err.message; }
      finally { btn.disabled = false; btn.textContent = '重新分析'; }
    };
  }
  async function renderAISettings() {
    const cfg = ((await DB.get('meta', 'aiConfig')) || {}).value || {};
    const PRESETS = [
      { name: '智谱 GLM（免费）', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4.7-flash' },
      { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' },
      { name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
      { name: 'Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'kimi-k3' },
      { name: '豆包', endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-seed-2-1-pro-260628' },
    ];
    app.innerHTML = header('AI 设置', '填入你自己的大模型接口（密钥仅存本机，不上传）') +
      `<div class="container"><div class="card">
        <div class="section-title">快速选择服务商</div>
        <div class="chips" id="presets">${PRESETS.map((p) => `<span class="chip" data-ep="${esc(p.endpoint)}" data-m="${esc(p.model)}">${esc(p.name)}</span>`).join('')}</div>
        <div class="section-title" style="margin-top:10px">接口地址（兼容 /chat/completions 协议）</div>
        <input id="ep" placeholder="https://api.deepseek.com/chat/completions" value="${esc(cfg.endpoint || '')}">
        <div class="section-title" style="margin-top:10px">API Key</div>
        <input id="key" type="password" placeholder="粘贴你的密钥" value="${esc(cfg.apiKey || '')}">
        <div class="section-title" style="margin-top:10px">模型名</div>
        <input id="model" placeholder="glm-4.7-flash" value="${esc(cfg.model || '')}">
        <div class="muted" style="font-size:12px;margin-top:8px">支持任意兼容 /chat/completions 协议的端点。点上方芯片即自动填好「接口地址 + 模型名」，只差你的 Key。<b>想零成本就用「智谱 GLM（免费）」</b>——<code>glm-4.7-flash</code> 目前免费、无需充值；DeepSeek、通义千问（阿里云百炼）、Kimi、豆包（火山方舟）均已按 2026 年最新模型名填好。<b>豆包</b>若报 model not found，请把「模型名」改成你在火山方舟「推理接入点」里看到的 <code>ep-...</code> 接入点 ID。未配置时 AI 按钮会提示来这里填。</div>
        <button class="btn-primary" id="save" style="margin-top:12px">保存</button>
        <button class="btn-ghost" id="back" style="width:100%;margin-top:8px">返回</button>
      </div></div>`;
    document.getElementById('presets').querySelectorAll('.chip').forEach((ch) => {
      ch.onclick = () => { document.getElementById('ep').value = ch.dataset.ep; document.getElementById('model').value = ch.dataset.m; toast('已填入「' + ch.textContent + '」接口，再贴 Key 即可'); };
    });
    document.getElementById('save').onclick = async () => {
      const v = { endpoint: document.getElementById('ep').value.trim(), apiKey: document.getElementById('key').value.trim(), model: document.getElementById('model').value.trim() };
      if (!v.endpoint || !v.apiKey) { toast('接口地址和 Key 都要填'); return; }
      await DB.put('meta', { key: 'aiConfig', value: v }); toast('已保存'); go('#/me');
    };
    document.getElementById('back').onclick = () => go('#/me');
  }


  // ---------------- 我的 ----------------
  function renderMe() {
    const user = Cloud.currentUser();
    let accountHtml;
    if (user) {
      accountHtml = `<div class="card" style="margin-top:14px">
        <div class="section-title">云端账号</div>
        <p style="margin:4px 0">已登录：<b>${esc(user.email || user.id)}</b></p>
        <p class="muted" style="font-size:12px;margin:4px 0">登录后，题库与刷题进度自动同步云端，可在任意设备访问（按账号隔离）。</p>
        <button class="btn-ghost" id="logout" style="width:100%;margin-top:6px">退出登录</button>
      </div>`;
    } else {
      accountHtml = `<div class="card" style="margin-top:14px">
        <div class="section-title">云端账号</div>
        <p class="muted" style="margin:4px 0">${Cloud.isReady() ? '登录后开启云端同步（多设备、换手机不丢失）。' : '当前为纯本机离线版；云端同步（多设备、换手机不丢失）为后续付费功能。'}</p>
        ${Cloud.isReady() ? '<button class="btn-primary" id="login" style="width:100%;margin-top:6px">登录 / 注册</button>' : '<p class="muted" style="margin-top:6px">—</p>'}
      </div>`;
    }
    app.innerHTML = header('我的', '数据管理与关于') +
      `<div class="container">
        ${accountHtml}
        <div class="card" style="margin-top:14px">
          <div class="section-title">题库导入</div>
          <button class="btn-ghost" id="toImport" style="width:100%;margin:6px 0">📥 导入题库（txt / md / csv / pdf / docx）</button>
          <p class="muted" style="font-size:12px;margin:2px 0 10px">题库首页顶部也有同一个入口。提醒：「编辑分类」页里的「选择文件」是选<b>分类封面图</b>的，那里 <b>选不了题库文档</b>。</p>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-title">数据备份与恢复（本机）</div>
          <button class="btn-ghost" id="exp" style="width:100%;margin:6px 0">导出数据备份</button>
          <button class="btn-ghost" id="imp" style="width:100%;margin:6px 0">从备份文件恢复</button>
          <p class="muted" style="font-size:12px;margin:2px 0 10px">把全部题库与刷题进度存成一个备份文件（换手机或清缓存前建议先备份）；需要找回时，点"从备份文件恢复"选中该文件即可。</p>
          <input type="file" id="impFile" accept="application/json,.json" style="display:none">
          <button class="btn-danger" id="clr" style="width:100%;margin:6px 0">清空全部数据</button>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-title">AI 能力（可选）</div>
          <p class="muted" style="margin:4px 0">考点分析、押题、考频统计需接入你自己的大模型。填入接口密钥后，刷题时即可用 AI。</p>
          <button class="btn-ghost" id="ai" style="width:100%;margin-top:6px">AI 设置（填接口密钥）</button>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-title">数据与费用 · 如何调用 AI</div>
          <p class="muted" style="margin:4px 0"><b>① 数据与费用（与 App 作者无关）：</b></p>
          <p class="muted" style="margin:2px 0;padding-left:10px">• 你填的接口地址 / API Key / 模型名 <b>只存你自己设备</b>（本地 IndexedDB 的 meta 库），<b>不上传任何服务器</b>。<br>
          • 调用费用由你的模型供应商（DeepSeek / 通义 / Kimi / 智谱等）按<b>你自己的账号</b>计费；本 App <b>零后端、免费</b>，作者不抽成、不代付、收不到任何数据。<br>
          • 本 App 只是个帮你排版请求、显示结果的前端界面——你用谁的 Key、花谁的钱、走谁的 AI，都只和你与供应商有关。</p>
          <p class="muted" style="margin:8px 0 2px"><b>② 如何调用 API（透明可查）：</b></p>
          <p class="muted" style="margin:2px 0;padding-left:10px">点「AI 考点分析 / 押题」时，浏览器<b>直接</b>向你填的接口发一条 HTTPS 请求（OpenAI 兼容的 <code>/chat/completions</code>）：<br>
          • <b>Header</b>：<code>Authorization: Bearer &lt;你的Key&gt;</code>、<code>Content-Type: application/json</code>；<br>
          • <b>Body</b>：<code>{ model: 你填的模型名, messages: [系统提示(设定其为考点分析助手), 用户消息(你选中的题目与答案文本)] }</code>；<br>
          • 供应商返回的文本<b>直接渲染到页面</b>，请求<b>不经过任何中间服务器或开发者</b>。<br>
          • <b>唯一会离开本机的内容</b>，是<b>你被分析的这道题的文本</b>，且只发往你指定的供应商，按该供应商的隐私条款处理；题库其余部分全程离线、不出设备。</p>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-title">关于</div>
          <p class="muted" style="margin:4px 0">Kaodiantong 考点通 V1.0 · 智能刷题与押题 · 离线 PWA<br>
          导入你的考研 / 考公 / 高考题库文档，刷题统计进度、乱序重刷、错题本，并接入你自己的大模型做考频分析、重点梳理与押题。<br>
          数据默认存本机；登录后题库与刷题进度同步云端（按账号隔离）。</p>
          <p class="muted" style="margin:8px 0"><b>法律声明：</b>本软件以「原样」提供，作者与宁德师范学院医学院不对使用本工具产生的任何结果承担责任；题库内容版权归原作者 / 出版方所有，用户须确保所导入内容已获合法授权、不侵犯第三方权益，并遵守相关考试纪律与知识产权法规。本工具仅用于辅助学习，不构成考试、医疗或法律建议。</p>
          <p class="muted" style="margin:8px 0"><b>使命：</b>敬畏生命、厚植学识——以工具提升复习效率，更以诚信应考与严谨治学守护医者初心；愿每一次刷题，都是向「良医」靠近的一步。</p>
          <p class="muted" style="margin:8px 0"><b>AI 免责声明：</b>AI 考点分析与押题由你自行接入的大模型生成，仅供参考，不保证押中当年试题，请以官方考试大纲与教材为准；本工具不构成考试或备考建议。</p>
          <div class="credits" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line,#e0e0e0)">
            <div style="font-size:13px;line-height:1.9">
              <span class="muted">软件开发：</span>苏裕盛 教授 / 医学博士<br>
              <span class="muted">创意发想：</span>叶桢 同学<br>
              <span class="muted">支持单位：</span>宁德师范学院医学院
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById('toImport').onclick = () => go('#/lib/import');
    document.getElementById('exp').onclick = exportData;
    document.getElementById('imp').onclick = () => document.getElementById('impFile').click();
    document.getElementById('impFile').onchange = importData;
    document.getElementById('clr').onclick = async () => {
      if (confirm('将删除全部记录、标本、自定义SOP、配伍与复习卡片，且不可恢复。确定？')) {
        for (const s of DB.STORES) if (s !== 'meta') await DB.clear(s);
        toast('已清空'); route();
      }
    };
    if (user) document.getElementById('logout').onclick = async () => { await Cloud.signOut(); toast('已退出'); route(); };
    else if (Cloud.isReady()) document.getElementById('login').onclick = () => go('#/auth');
    document.getElementById('ai').onclick = () => go('#/me/ai');
  }

  // ---------------- 登录 / 注册 ----------------
  async function renderAuth() {
    app.innerHTML = header('登录 / 注册', '云端账号 · 邮箱') +
      `<div class="container">
        <div class="card">
          <div class="row" id="tabs" style="gap:6px;margin-bottom:10px">
            <span class="tag" data-t="pw" style="background:var(--brand);color:#fff">密码登录</span>
            <span class="tag" data-t="signup">注册</span>
            <span class="tag" data-t="otp">验证码登录</span>
            <span class="tag" data-t="reset">找回密码</span>
          </div>
          <input id="email" placeholder="邮箱（如：you@example.com）">
          <div id="pwBox"><input id="pw" type="password" placeholder="密码（注册需≥6位）"></div>
          <div id="codeBox" style="display:none"><input id="code" placeholder="邮箱验证码"><button class="btn-ghost" id="send" style="width:100%;margin-top:6px">获取验证码</button></div>
          <button class="btn-primary" id="submit" style="width:100%;margin-top:8px">登录</button>
          <p id="msg" class="muted" style="font-size:12px;margin:8px 0 0"></p>
        </div>
        <button class="btn-ghost" id="back" style="width:100%">返回</button>
      </div>`;
    let mode = 'pw';
    let pending = null;
    const msg = (t) => { document.getElementById('msg').textContent = t; };
    function setMode(m) {
      mode = m;
      document.querySelectorAll('#tabs .tag').forEach((el) => {
        const on = el.getAttribute('data-t') === m;
        el.style.background = on ? 'var(--brand)' : '';
        el.style.color = on ? '#fff' : '';
      });
      document.getElementById('pwBox').style.display = (m === 'pw' || m === 'signup') ? '' : 'none';
      document.getElementById('codeBox').style.display = (m === 'signup' || m === 'otp') ? '' : 'none';
      document.getElementById('submit').textContent =
        m === 'pw' ? '登录' : m === 'signup' ? '注册' : m === 'otp' ? '验证码登录' : '发送重置邮件';
    }
    document.querySelectorAll('#tabs .tag').forEach((el) => el.onclick = () => setMode(el.getAttribute('data-t')));
    document.getElementById('send').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      if (!email) { msg('请先填写邮箱'); return; }
      const r = await Cloud.sendEmailCode(email);
      if (r.error) { msg(r.error.message || '发送失败'); return; }
      pending = { email, verificationId: r.data.verificationId, isExistingUser: r.data.isExistingUser };
      msg('验证码已发送，请查收邮箱');
    };
    document.getElementById('submit').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      if (!email) { msg('请填写邮箱'); return; }
      try {
        if (mode === 'pw') {
          const r = await Cloud.signInPassword(email, document.getElementById('pw').value);
          if (r.error) { msg(r.error.message || '登录失败'); return; }
        } else if (mode === 'signup') {
          if (!pending || pending.email !== email) { msg('请先获取验证码'); return; }
          const r = await Cloud.verifyEmailOtp(email, pending.verificationId, pending.isExistingUser, document.getElementById('code').value, document.getElementById('pw').value);
          if (r.error) { msg(r.error.message || '注册失败'); return; }
        } else if (mode === 'otp') {
          if (!pending || pending.email !== email) { msg('请先获取验证码'); return; }
          const r = await Cloud.verifyEmailOtp(email, pending.verificationId, pending.isExistingUser, document.getElementById('code').value);
          if (r.error) { msg(r.error.message || '登录失败'); return; }
        } else if (mode === 'reset') {
          const r = await Cloud.resetPassword(email);
          if (r.error) { msg(r.error.message || '发送失败'); return; }
          msg('重置邮件已发送，请查收'); return;
        }
        toast('登录成功'); go('#/me');
      } catch (e) { msg(e.message || '出错了'); }
    };
    document.getElementById('back').onclick = () => go('#/me');
    setMode('pw');
  }
  async function exportData() {
    const out = {};
    for (const s of DB.STORES) out[s] = await DB.getAll(s);
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'medlab-backup-' + today() + '.json';
    a.click();
    toast('已导出');
  }
  async function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      for (const s of DB.STORES) if (data[s] && Array.isArray(data[s])) await DB.bulk(s, data[s]);
      toast('导入完成'); route();
    } catch (err) { toast('导入失败：格式错误'); }
  }

  // ---------------- 启动 ----------------
  async function start() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      try {
        // 带版本号注册：脚本 URL 变化会触发浏览器立即安装新 SW（清除旧缓存锁死）
        navigator.serviceWorker.register('sw.js?v=1').catch(() => {});
        // 新 SW 接管后自动刷新一次，避免用户"要刷两次才生效"
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!sessionStorage.getItem('__swReloaded')) {
            sessionStorage.setItem('__swReloaded', '1');
            location.reload();
          }
        });
      } catch (_) {}
    }
    try { if (window.Cloud && Cloud.init()) await Cloud.refreshSession(); } catch (e) { console.warn('cloud init failed', e); }
    try { await ensureSeed(); } catch (e) { console.warn('seed failed', e); }
    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/lib';
    else route();
  }
  start();
})();
