/* 考点通 —— IndexedDB 离线存储封装（本地优先，无需网络） */
(function (global) {
  const DB_NAME = 'examdrill_notes';
  const DB_VERSION = 1; // 独立刷题 App：仅 library（题库）+ meta（配置/示例标记）
  const STORES = ['library', 'meta'];
  let dbp = null;

  // 升级回调：把代码需要的存储「建全 / 修正」
  function upgrade(e) {
    const db = e.target.result;
    STORES.forEach((s) => {
      const kp = s === 'meta' ? 'key' : 'id';
      try {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: kp });
        } else {
          // 修正历史版本中 keyPath 建错的存储（如 meta 曾被建成 'id'）
          const st = e.target.transaction.objectStore(s);
          if (st.keyPath !== kp) {
            db.deleteObjectStore(s);
            db.createObjectStore(s, { keyPath: kp });
          }
        }
      } catch (err) {
        console.warn('[db] 升级存储失败：', s, err);
      }
    });
  }

  // 单次打开；version 传 null 表示「以本地现有版本打开、不触发升级」
  function openOnce(version) {
    return new Promise((resolve, reject) => {
      const req = version == null ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
      req.onupgradeneeded = upgrade;
      req.onblocked = () => reject(new Error('本地数据库被其它已打开的页面占用，请关掉其它标签 / 后台的 App 后再试'));
      req.onsuccess = () => {
        const db = req.result;
        // 让路：将来别的页面要升级时，本连接主动关闭，避免把升级「顶住」
        db.onversionchange = () => { try { db.close(); } catch (_) {} dbp = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('无法打开本地数据库'));
    });
  }

  // 自愈版 openDB：确保 STORES 里每个存储都真实存在；缺哪个就升版重建（已有数据不丢）
  function openDB() {
    if (dbp) return dbp;
    dbp = (async () => {
      let db;
      try {
        db = await openOnce(DB_VERSION);
      } catch (err) {
        // 本地库版本已高于代码（曾自愈升级过）→ 以现有版本打开
        if (err && err.name === 'VersionError') db = await openOnce(null);
        else throw err;
      }
      if (STORES.some((s) => !db.objectStoreNames.contains(s))) {
        const next = (db.version || 1) + 1; // 升一版，强制触发 onupgradeneeded 把缺失的建齐
        try { db.close(); } catch (_) {}
        db = await openOnce(next);
      }
      return db;
    })();
    dbp = dbp.catch((err) => { dbp = null; throw err; });
    return dbp;
  }

  function req(r) {
    return new Promise((s, e) => {
      r.onsuccess = () => s(r.result);
      r.onerror = () => e(r.error);
    });
  }

  async function getAll(s) {
    const db = await openDB();
    return req(db.transaction(s, 'readonly').objectStore(s).getAll());
  }
  async function get(s, id) {
    const db = await openDB();
    return req(db.transaction(s, 'readonly').objectStore(s).get(id));
  }
  async function put(s, v) {
    const db = await openDB();
    return req(db.transaction(s, 'readwrite').objectStore(s).put(v));
  }
  async function del(s, id) {
    const db = await openDB();
    return req(db.transaction(s, 'readwrite').objectStore(s).delete(id));
  }
  async function clear(s) {
    const db = await openDB();
    return req(db.transaction(s, 'readwrite').objectStore(s).clear());
  }
  async function bulk(s, items) {
    const db = await openDB();
    const t = db.transaction(s, 'readwrite');
    const os = t.objectStore(s);
    items.forEach((i) => os.put(i));
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  async function count(s) {
    const db = await openDB();
    return req(db.transaction(s, 'readonly').objectStore(s).count());
  }

  global.DB = { openDB, getAll, get, put, del, clear, bulk, count, STORES };
})(window);
