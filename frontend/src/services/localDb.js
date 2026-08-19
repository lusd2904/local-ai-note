/**
 * iOS / 移动端离线优先本地数据库引擎 (基于 IndexedDB)
 * 具备完整的本地 CRUD、软删除跟踪与双向增量同步能力
 */

const DB_NAME = 'LocalAINote_iOS_DB';
const DB_VERSION = 1;

class LocalDatabase {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        // 1. 笔记存储
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('notebook_id', 'notebook_id', { unique: false });
          noteStore.createIndex('updated_at', 'updated_at', { unique: false });
          noteStore.createIndex('is_trashed', 'is_trashed', { unique: false });
          noteStore.createIndex('is_starred', 'is_starred', { unique: false });
        }

        // 2. 笔记本分类存储
        if (!db.objectStoreNames.contains('notebooks')) {
          const nbStore = db.createObjectStore('notebooks', { keyPath: 'id' });
          nbStore.createIndex('parent_id', 'parent_id', { unique: false });
          nbStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // 3. 语音录音存储
        if (!db.objectStoreNames.contains('audio_records')) {
          const audioStore = db.createObjectStore('audio_records', { keyPath: 'id' });
          audioStore.createIndex('note_id', 'note_id', { unique: false });
        }

        // 4. AI 设置与系统偏好
        if (!db.objectStoreNames.contains('ai_settings')) {
          db.createObjectStore('ai_settings', { keyPath: 'id' });
        }

        // 5. 同步元数据 (已配对 Mac 服务器、Token、最后同步时间)
        if (!db.objectStoreNames.contains('sync_meta')) {
          db.createObjectStore('sync_meta', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('IndexedDB 打开失败:', e);
        reject(e);
      };
    });
  }

  async getStore(storeName, mode = 'readonly') {
    await this.initPromise;
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // L5: 使用密码学安全的 UUID 生成
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // 降级方案
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ----------------- 笔记 (Notes) CRUD -----------------

  // C4 修复: 新增 includeAll 参数支持同步时获取全量数据（含废纸篓）
  async getNotes(options = {}) {
    const store = await this.getStore('notes', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let notes = request.result || [];

        // C4: 如果 includeAll=true，跳过废纸篓过滤（同步场景需要）
        if (!options.includeAll) {
          if (options.is_trashed === true) {
            notes = notes.filter(n => Boolean(n.is_trashed));
          } else if (options.is_trashed === false || options.is_trashed === undefined) {
            notes = notes.filter(n => !n.is_trashed);
          }
        }

        // 过滤收藏
        if (options.is_starred) {
          notes = notes.filter(n => Boolean(n.is_starred));
        }
        // 过滤笔记本分类
        if (options.notebook_id) {
          notes = notes.filter(n => n.notebook_id === options.notebook_id);
        }
        // 搜索关键词
        if (options.search) {
          const q = options.search.toLowerCase();
          notes = notes.filter(n => 
            (n.title && n.title.toLowerCase().includes(q)) || 
            (n.content && n.content.toLowerCase().includes(q))
          );
        }
        // 按更新时间降序排列
        notes.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        resolve(notes);
      };
      request.onerror = reject;
    });
  }

  async getNote(id) {
    const store = await this.getStore('notes', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = reject;
    });
  }

  async createNote(data) {
    const store = await this.getStore('notes', 'readwrite');
    const now = new Date().toISOString();
    const note = {
      id: data.id || this.generateUUID(),
      title: data.title || '无标题笔记',
      content: data.content || '',
      content_json: data.content_json || '',
      notebook_id: data.notebook_id || null,
      summary: data.summary || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      is_starred: Boolean(data.is_starred),
      is_trashed: false,
      is_locked: Boolean(data.is_locked),
      password_hash: data.password_hash || null,
      created_at: data.created_at || now,
      updated_at: now,
      audio_count: 0
    };

    return new Promise((resolve, reject) => {
      const request = store.put(note);
      request.onsuccess = () => resolve(note);
      request.onerror = reject;
    });
  }

  async updateNote(id, updates) {
    const current = await this.getNote(id);
    if (!current) throw new Error('笔记未找到');

    const store = await this.getStore('notes', 'readwrite');
    const updated = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(updated);
      request.onsuccess = () => resolve(updated);
      request.onerror = reject;
    });
  }

  async deleteNote(id, permanent = false) {
    const store = await this.getStore('notes', 'readwrite');
    if (permanent) {
      return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = reject;
      });
    } else {
      return this.updateNote(id, { is_trashed: true });
    }
  }

  // ----------------- 笔记本 (Notebooks) CRUD -----------------
  async getNotebooks() {
    const store = await this.getStore('notebooks', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        resolve(list);
      };
      request.onerror = reject;
    });
  }

  async createNotebook(data) {
    const store = await this.getStore('notebooks', 'readwrite');
    const now = new Date().toISOString();
    const nb = {
      id: data.id || this.generateUUID(),
      name: data.name || '新建笔记本',
      parent_id: data.parent_id || null,
      color: data.color || '#3B82F6',
      icon: data.icon || 'BookOpen',
      sort_order: data.sort_order || 0,
      created_at: data.created_at || now,
      updated_at: now
    };

    return new Promise((resolve, reject) => {
      const request = store.put(nb);
      request.onsuccess = () => resolve(nb);
      request.onerror = reject;
    });
  }

  // C6 修复: updateNotebook 确保 get 和 put 在同一事务中
  async updateNotebook(id, updates) {
    await this.initPromise;
    const tx = this.db.transaction('notebooks', 'readwrite');
    const store = tx.objectStore('notebooks');

    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const current = getReq.result;
        if (!current) return reject(new Error('笔记本未找到'));
        const updated = {
          ...current,
          ...updates,
          updated_at: new Date().toISOString()
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = reject;
      };
      getReq.onerror = reject;

      tx.onerror = () => reject(new Error('事务执行失败'));
    });
  }

  async deleteNotebook(id) {
    const store = await this.getStore('notebooks', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = reject;
    });
  }

  // ----------------- 同步元数据管理 (Sync Meta) -----------------
  async getSyncMeta(key, defaultValue = null) {
    const store = await this.getStore('sync_meta', 'readonly');
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = () => resolve(defaultValue);
    });
  }

  async setSyncMeta(key, value) {
    const store = await this.getStore('sync_meta', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value, updated_at: new Date().toISOString() });
      req.onsuccess = () => resolve(true);
      req.onerror = reject;
    });
  }

  // C5 修复: 批量同步数据使用单个多 store 原子事务
  async bulkApplySyncData(serverData) {
    await this.initPromise;
    const { server_notebooks = [], server_notes = [], server_audio_records = [] } = serverData;

    // C5: 所有 objectStore 在同一个事务中操作，保证原子性
    const storeNames = [];
    if (server_notebooks.length > 0) storeNames.push('notebooks');
    if (server_notes.length > 0) storeNames.push('notes');
    if (storeNames.length === 0) {
      // 无数据需要合并，只更新同步时间
      if (serverData.sync_timestamp) {
        await this.setSyncMeta('last_sync_time', serverData.sync_timestamp);
      }
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeNames, 'readwrite');

      // 合并笔记本
      if (server_notebooks.length > 0) {
        const nbStore = tx.objectStore('notebooks');
        for (const nb of server_notebooks) {
          nbStore.put(nb);
        }
      }

      // 合并笔记
      if (server_notes.length > 0) {
        const noteStore = tx.objectStore('notes');
        for (const note of server_notes) {
          noteStore.put(note);
        }
      }

      tx.oncomplete = async () => {
        // 事务成功提交后再记录同步时间
        if (serverData.sync_timestamp) {
          await this.setSyncMeta('last_sync_time', serverData.sync_timestamp);
        }
        resolve(true);
      };

      tx.onerror = () => reject(new Error('批量同步数据事务失败'));
      tx.onabort = () => reject(new Error('批量同步数据事务被中止'));
    });
  }
}

export const localDb = new LocalDatabase();
