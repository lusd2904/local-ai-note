import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

// 笔记本
export const getNotebooks = () => api.get('/notebooks').then(res => res.data);
export const createNotebook = (data) => api.post('/notebooks', data).then(res => res.data);
export const updateNotebook = (id, data) => api.put(`/notebooks/${id}`, data).then(res => res.data);
export const deleteNotebook = (id) => api.delete(`/notebooks/${id}`).then(res => res.data);

// 笔记
export const getNotes = (params = {}) => api.get('/notes', { params }).then(res => res.data);
export const getNoteStats = () => api.get('/notes/stats').then(res => res.data);
export const getNote = (id) => api.get(`/notes/${id}`).then(res => res.data);
export const createNote = (data) => api.post('/notes', data).then(res => res.data);
export const updateNote = (id, data) => api.put(`/notes/${id}`, data).then(res => res.data);
export const deleteNote = (id, permanent = false) => api.delete(`/notes/${id}`, { params: { permanent } }).then(res => res.data);
export const restoreNote = (id) => api.post(`/notes/${id}/restore`).then(res => res.data);
export const emptyTrash = () => api.delete('/notes/trash/empty').then(res => res.data);

// 录音与音频工坊
export const getAudioRecords = (noteId = null, extra = {}) => api.get('/audio', { params: { note_id: noteId, ...extra } }).then(res => res.data);
export const getAudioRecord = (id) => api.get(`/audio/${id}`).then(res => res.data);
export const uploadAudio = (formData) => api.post('/audio/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
}).then(res => res.data);
export const processAudio = (id) => api.post(`/audio/${id}/process`).then(res => res.data);
export const convertAudioToNote = (id, notebookId = null) => api.post(`/audio/${id}/convert-to-note`, null, {
  params: { notebook_id: notebookId }
}).then(res => res.data);
export const deleteAudioRecord = (id) => api.delete(`/audio/${id}`).then(res => res.data);

// AI 分析与设置
export const analyzeContent = (data) => api.post('/ai/analyze', data).then(res => res.data);
export const chatWithNote = (data) => api.post('/ai/chat', data).then(res => res.data);
export const getAISettings = () => api.get('/ai/settings').then(res => res.data);
export const updateAISettings = (data) => api.post('/ai/settings', data).then(res => res.data);
export const testAIConnection = () => api.post('/ai/test-connection').then(res => res.data);

// 🌟 流式 AI 快捷分析算子 (SSE)
export const streamAIAnalyze = async ({ content, action, target_lang }, onChunk, onComplete, onError) => {
  try {
    const response = await fetch('/api/ai/analyze/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, action, target_lang })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              if (onError) onError(new Error(data.error));
              return;
            }
            if (data.chunk && onChunk) {
              onChunk(data.chunk);
            }
            if (data.done) {
              if (onComplete) onComplete();
              return;
            }
          } catch (e) {}
        }
      }
    }
    if (onComplete) onComplete();
  } catch (err) {
    if (onError) onError(err);
  }
};

// 🌟 流式 AI Copilot 问答 (SSE)
export const streamAIChat = async ({ messages, note_title, note_content, audio_transcript }, onChunk, onComplete, onError) => {
  try {
    const response = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, note_title, note_content, audio_transcript })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              if (onError) onError(new Error(data.error));
              return;
            }
            if (data.chunk && onChunk) {
              onChunk(data.chunk);
            }
            if (data.done) {
              if (onComplete) onComplete();
              return;
            }
          } catch (e) {}
        }
      }
    }
    if (onComplete) onComplete();
  } catch (err) {
    if (onError) onError(err);
  }
};

// 图片上传
export const uploadImage = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data);
};

// 笔记加锁与二次验证
export const lockNote = (id, password) => api.post(`/notes/${id}/lock`, { password }).then(res => res.data);
export const verifyNotePassword = (id, password) => api.post(`/notes/${id}/verify-password`, { password }).then(res => res.data);
export const unlockNote = (id, password) => api.post(`/notes/${id}/unlock`, { password }).then(res => res.data);

// 笔记克隆与批量导入
export const cloneNote = (id) => api.post(`/notes/${id}/clone`).then(res => res.data);
export const batchImportNotes = (files, notebookId = null) => {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  if (notebookId) {
    formData.append('notebook_id', notebookId);
  }
  return api.post('/notes/batch-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data);
};

// 知识图谱与双向链接
export const getKnowledgeGraph = () => api.get('/notes/graph/data').then(res => res.data);
export const getNoteBacklinks = (id) => api.get(`/notes/${id}/backlinks`).then(res => res.data);

// 闪念速记 (Memos)
export const getMemos = (params = {}) => api.get('/memos', { params }).then(res => res.data);
export const createMemo = (data) => api.post('/memos', data).then(res => res.data);
export const updateMemo = (id, data) => api.put(`/memos/${id}`, data).then(res => res.data);
export const deleteMemo = (id) => api.delete(`/memos/${id}`).then(res => res.data);
export const convertMemosToNote = (data) => api.post('/memos/convert-to-note', data).then(res => res.data);

// 多维数据表 (Databases)
export const getDatabases = (params = {}) => api.get('/databases', { params }).then(res => res.data);
export const getDatabase = (id) => api.get(`/databases/${id}`).then(res => res.data);
export const createDatabase = (data = {}, createSamples = false) => api.post('/databases', data, { params: { create_samples: createSamples } }).then(res => res.data);
export const updateDatabase = (id, data) => api.put(`/databases/${id}`, data).then(res => res.data);
export const deleteDatabase = (id, permanent = false) => api.delete(`/databases/${id}`, { params: { permanent } }).then(res => res.data);
export const restoreDatabase = (id) => api.post(`/databases/${id}/restore`).then(res => res.data);


// 数据行记录 (Rows)
export const createDatabaseRow = (databaseId, data = {}) => api.post(`/databases/${databaseId}/rows`, data).then(res => res.data);
export const updateDatabaseRow = (databaseId, rowId, data) => api.put(`/databases/${databaseId}/rows/${rowId}`, data).then(res => res.data);
export const deleteDatabaseRow = (databaseId, rowId) => api.delete(`/databases/${databaseId}/rows/${rowId}`).then(res => res.data);

export const downloadBackup = async () => {
  const res = await api.post('/system/backup', null, { responseType: 'blob' });
  const disp = res.headers['content-disposition'] || '';
  const match = disp.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : `note_backup_${Date.now()}.tar.gz`;
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

export const restoreBackup = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/system/restore', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(res => res.data);
};

export default api;


