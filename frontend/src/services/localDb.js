/**
 * iOS / 移动端离线优先本地数据库引擎 (基于 IndexedDB)
 * 具备完整的本地 CRUD、软删除跟踪、双向增量同步、离线知识图谱与打卡热力图计算能力
 */

const DB_NAME = 'LocalAINote_iOS_DB';
const DB_VERSION = 2;

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

        // 4. 闪念速记存储 (v2 新增)
        if (!db.objectStoreNames.contains('memos')) {
          const memoStore = db.createObjectStore('memos', { keyPath: 'id' });
          memoStore.createIndex('created_at', 'created_at', { unique: false });
          memoStore.createIndex('is_pinned', 'is_pinned', { unique: false });
          memoStore.createIndex('is_archived', 'is_archived', { unique: false });
        }

        // 5. AI 设置与系统偏好
        if (!db.objectStoreNames.contains('ai_settings')) {
          db.createObjectStore('ai_settings', { keyPath: 'id' });
        }

        // 6. 同步元数据 (已配对 Mac 服务器、Token、最后同步时间)
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

  // 密码学安全 UUID 生成
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ----------------- 笔记 (Notes) CRUD -----------------

  async getNotes(options = {}) {
    const store = await this.getStore('notes', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let notes = request.result || [];

        if (!options.includeAll) {
          if (options.is_trashed === true) {
            notes = notes.filter(n => Boolean(n.is_trashed));
          } else if (options.is_trashed === false || options.is_trashed === undefined) {
            notes = notes.filter(n => !n.is_trashed);
          }
        }

        if (options.is_starred) {
          notes = notes.filter(n => Boolean(n.is_starred));
        }
        if (options.notebook_id) {
          notes = notes.filter(n => n.notebook_id === options.notebook_id);
        }
        if (options.search) {
          const q = options.search.toLowerCase();
          notes = notes.filter(n => 
            (n.title && n.title.toLowerCase().includes(q)) || 
            (n.content && n.content.toLowerCase().includes(q))
          );
        }
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
      password_hash: null,
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

  // ----------------- 闪念速记 (Memos) CRUD -----------------
  async getMemos(options = {}) {
    const store = await this.getStore('memos', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let list = request.result || [];
        if (options.is_archived !== undefined) {
          list = list.filter(m => Boolean(m.is_archived) === Boolean(options.is_archived));
        } else {
          list = list.filter(m => !m.is_archived);
        }
        if (options.tag) {
          list = list.filter(m => Array.isArray(m.tags) && m.tags.includes(options.tag));
        }
        if (options.keyword) {
          const q = options.keyword.toLowerCase();
          list = list.filter(m => m.content && m.content.toLowerCase().includes(q));
        }
        // 置顶优先，最新创建靠前
        list.sort((a, b) => {
          if (b.is_pinned !== a.is_pinned) return b.is_pinned ? 1 : -1;
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        resolve(list);
      };
      request.onerror = reject;
    });
  }

  async createMemo(data) {
    const store = await this.getStore('memos', 'readwrite');
    const now = new Date().toISOString();
    
    // 自动提取正文中的 #标签
    const autoTags = (data.content.match(/#([\w\u4e00-\u9fa5]+)/g) || []).map(t => t.slice(1));
    const mergedTags = Array.from(new Set([...(data.tags || []), ...autoTags]));

    const memo = {
      id: data.id || this.generateUUID(),
      content: data.content || '',
      images: Array.isArray(data.images) ? data.images : [],
      tags: mergedTags,
      is_pinned: Boolean(data.is_pinned),
      is_archived: false,
      created_at: data.created_at || now,
      updated_at: now
    };

    return new Promise((resolve, reject) => {
      const req = store.put(memo);
      req.onsuccess = () => resolve(memo);
      req.onerror = reject;
    });
  }

  async updateMemo(id, updates) {
    const store = await this.getStore('memos', 'readwrite');
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const current = getReq.result;
        if (!current) return reject(new Error('闪念记录未找到'));
        
        let tags = updates.tags !== undefined ? updates.tags : current.tags;
        if (updates.content) {
          const autoTags = (updates.content.match(/#([\w\u4e00-\u9fa5]+)/g) || []).map(t => t.slice(1));
          tags = Array.from(new Set([...(tags || []), ...autoTags]));
        }

        const updated = {
          ...current,
          ...updates,
          tags,
          updated_at: new Date().toISOString()
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = reject;
      };
      getReq.onerror = reject;
    });
  }

  async deleteMemo(id) {
    const store = await this.getStore('memos', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = reject;
    });
  }

  // ----------------- 离线知识图谱与反向链接计算 -----------------
  async getGraphData() {
    const notes = await this.getNotes({ is_trashed: false });
    const notebooks = await this.getNotebooks();
    const nbMap = {};
    notebooks.forEach(nb => { nbMap[nb.id] = nb.name; });

    const titleMap = {};
    notes.forEach(n => {
      if (n.title) titleMap[n.title.trim().toLowerCase()] = n;
    });

    const nodes = [];
    const links = [];
    const linkCounts = {};
    const tagNodes = {};

    // 1. 注册笔记节点
    notes.forEach(n => {
      nodes.push({
        id: n.id,
        title: n.title || '无标题笔记',
        notebook_id: n.notebook_id,
        notebook_name: nbMap[n.notebook_id] || '未分类',
        group: 'note',
        val: 1
      });
      linkCounts[n.id] = 0;
    });

    // 2. 解析正文中的 [[双链]] 与 #标签
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    notes.forEach(n => {
      const content = n.content || '';
      let match;
      while ((match = linkRegex.exec(content)) !== null) {
        const targetTitle = match[1].trim().toLowerCase();
        const targetNote = titleMap[targetTitle];
        if (targetNote && targetNote.id !== n.id) {
          links.push({
            source: n.id,
            target: targetNote.id,
            label: 'link'
          });
          linkCounts[n.id] = (linkCounts[n.id] || 0) + 1;
          linkCounts[targetNote.id] = (linkCounts[targetNote.id] || 0) + 1;
        }
      }

      // 标签节点
      const tags = Array.isArray(n.tags) ? n.tags : [];
      tags.forEach(tag => {
        const tagId = `tag_${tag}`;
        if (!tagNodes[tagId]) {
          tagNodes[tagId] = {
            id: tagId,
            title: `#${tag}`,
            notebook_id: null,
            notebook_name: '标签',
            group: 'tag',
            val: 2
          };
          linkCounts[tagId] = 0;
        }
        links.push({
          source: n.id,
          target: tagId,
          label: 'tag'
        });
        linkCounts[n.id] = (linkCounts[n.id] || 0) + 1;
        linkCounts[tagId] = (linkCounts[tagId] || 0) + 1;
      });
    });

    // 合并标签节点并计算节点权重
    Object.values(tagNodes).forEach(t => nodes.push(t));
    nodes.forEach(n => {
      n.val = Math.max(1, linkCounts[n.id] || 1);
    });

    return { nodes, links };
  }

  // ----------------- 离线 365 天创作打卡热力图统计 -----------------
  async getActivityHeatmapData() {
    const notes = await this.getNotes({ includeAll: true });
    const memos = await this.getMemos({ is_archived: false });

    const dateMap = {}; // "YYYY-MM-DD" -> { count: 0, chars: 0 }

    const addStat = (dateStr, charCount) => {
      if (!dateStr) return;
      const d = dateStr.slice(0, 10);
      if (!dateMap[d]) dateMap[d] = { count: 0, chars: 0 };
      dateMap[d].count += 1;
      dateMap[d].chars += (charCount || 0);
    };

    notes.forEach(n => {
      addStat(n.created_at, (n.content || '').length);
    });

    memos.forEach(m => {
      addStat(m.created_at, (m.content || '').length);
    });

    return dateMap;
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

  // 批量同步数据使用单个多 store 原子事务
  async bulkApplySyncData(serverData) {
    await this.initPromise;
    const { 
      server_notebooks = [], 
      server_notes = [], 
      server_memos = [] 
    } = serverData;

    const storeNames = [];
    if (server_notebooks.length > 0) storeNames.push('notebooks');
    if (server_notes.length > 0) storeNames.push('notes');
    if (server_memos.length > 0) storeNames.push('memos');

    if (storeNames.length === 0) {
      if (serverData.sync_timestamp) {
        await this.setSyncMeta('last_sync_time', serverData.sync_timestamp);
      }
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeNames, 'readwrite');

      if (server_notebooks.length > 0) {
        const nbStore = tx.objectStore('notebooks');
        for (const nb of server_notebooks) {
          nbStore.put(nb);
        }
      }

      if (server_notes.length > 0) {
        const noteStore = tx.objectStore('notes');
        for (const note of server_notes) {
          noteStore.put(note);
        }
      }

      if (server_memos.length > 0) {
        const memoStore = tx.objectStore('memos');
        for (const memo of server_memos) {
          memoStore.put(memo);
        }
      }

      tx.oncomplete = async () => {
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
