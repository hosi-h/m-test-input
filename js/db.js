// iPad本体への保存（IndexedDB）。
// records: 測定データ（送信待ち・送信済）
// people : 候補表示用の基本情報（氏名・生年月日・性別・種目・ポジション）

const DB = (() => {
  const NAME = 'mtest-input';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('records')) {
          db.createObjectStore('records', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('people')) {
          db.createObjectStore('people', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    put: (store, value) => tx(store, 'readwrite', s => { s.put(value); }),
    get: (store, key) => tx(store, 'readonly', s => reqToPromise(s.get(key))),
    getAll: (store) => tx(store, 'readonly', s => reqToPromise(s.getAll())),
    delete: (store, key) => tx(store, 'readwrite', s => { s.delete(key); }),
    deleteMany: (store, keys) => tx(store, 'readwrite', s => { keys.forEach(k => s.delete(k)); }),
    clear: (store) => tx(store, 'readwrite', s => { s.clear(); }),
  };
})();
