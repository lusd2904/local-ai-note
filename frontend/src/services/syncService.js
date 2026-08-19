import axios from 'axios';
import { localDb } from './localDb';

export class SyncService {
  /**
   * 获取当前 Mac 服务端的同步与配对信息 (用于 Mac 端展示配对二维码和 PIN 码)
   */
  static async getMacSyncInfo() {
    try {
      const res = await axios.get('/api/sync/info', { timeout: 3000 });
      return res.data;
    } catch (err) {
      console.warn('获取本机同步信息失败:', err);
      return null;
    }
  }

  /**
   * 检查指定的 Mac 局域网服务地址是否在线
   */
  static async pingServer(serverUrl) {
    try {
      const cleanUrl = serverUrl.replace(/\/+$/, '');
      const res = await axios.get(`${cleanUrl}/api/sync/info`, { timeout: 2500 });
      return res.data;
    } catch (err) {
      return null;
    }
  }

  /**
   * iOS 端向 Mac 服务端发起设备配对握手
   */
  static async pairWithMac(serverUrl, pairingCode, deviceName = 'iPhone (Local AI Note)') {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const deviceId = await this.getOrCreateDeviceId();

    const res = await axios.post(`${cleanUrl}/api/sync/pair`, {
      device_id: deviceId,
      device_name: deviceName,
      pairing_code: pairingCode.trim().toUpperCase()
    }, { timeout: 5000 });

    if (res.data && res.data.token) {
      // 本地持久化保存已配对的 Mac 服务器与凭证
      await localDb.setSyncMeta('paired_server_url', cleanUrl);
      await localDb.setSyncMeta('paired_token', res.data.token);
      await localDb.setSyncMeta('paired_server_name', res.data.server_name || 'Mac 工作站');
      await localDb.setSyncMeta('paired_at', new Date().toISOString());
      return res.data;
    }
    throw new Error('配对响应凭证无效');
  }

  /**
   * 获取或生成当前移动设备的唯一 ID
   */
  static async getOrCreateDeviceId() {
    let deviceId = await localDb.getSyncMeta('device_id');
    if (!deviceId) {
      deviceId = 'ios_' + localDb.generateUUID().slice(0, 8);
      await localDb.setSyncMeta('device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * 执行完整的双向增量数据同步
   */
  static async executeTwoWaySync(customServerUrl = null) {
    const serverUrl = customServerUrl || await localDb.getSyncMeta('paired_server_url') || '';
    const token = await localDb.getSyncMeta('paired_token');
    const lastSyncTime = await localDb.getSyncMeta('last_sync_time');

    if (!serverUrl || !token) {
      throw new Error('设备尚未配对，请先扫描 Mac 屏幕二维码或输入 6 位配对码');
    }

    const cleanUrl = serverUrl.replace(/\/+$/, '');

    // M2: 仅获取自上次同步以来变动的增量数据（而非全量），减少传输量
    // C4: 使用 includeAll=true 确保废纸篓中的笔记也参与同步
    const allLocalNotes = await localDb.getNotes({ includeAll: true });
    const localNotebooks = await localDb.getNotebooks();

    // M2: 如果有上次同步时间，只推送有更新的记录
    let notesToPush = allLocalNotes;
    let notebooksToPush = localNotebooks;
    if (lastSyncTime) {
      const lastSyncDate = new Date(lastSyncTime);
      notesToPush = allLocalNotes.filter(n => new Date(n.updated_at) > lastSyncDate);
      notebooksToPush = localNotebooks.filter(nb => new Date(nb.updated_at) > lastSyncDate);
    }

    // 2. 发起双向原子同步请求
    const payload = {
      last_sync_time: lastSyncTime || null,
      token: token,
      notebooks: notebooksToPush,
      notes: notesToPush,
      audio_records: [],
      deleted_note_ids: [],
      deleted_notebook_ids: []
    };

    const res = await axios.post(`${cleanUrl}/api/sync/two-way`, payload, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const syncResult = res.data;

    // 3. 将从 Mac 服务端拉取回来的最新变动数据持久化合并到本地 IndexedDB
    if (syncResult && syncResult.status === 'success') {
      await localDb.bulkApplySyncData(syncResult);
      await localDb.setSyncMeta('last_sync_success_time', new Date().toISOString());
      return syncResult;
    }

    throw new Error('双向同步执行异常');
  }

  /**
   * 获取配对与连接状态概览
   */
  static async getSyncStatus() {
    const serverUrl = await localDb.getSyncMeta('paired_server_url');
    const token = await localDb.getSyncMeta('paired_token');
    const serverName = await localDb.getSyncMeta('paired_server_name');
    const lastSyncTime = await localDb.getSyncMeta('last_sync_time');

    let isOnline = false;
    if (serverUrl) {
      const ping = await this.pingServer(serverUrl);
      isOnline = Boolean(ping);
    }

    return {
      isPaired: Boolean(serverUrl && token),
      serverUrl,
      serverName,
      lastSyncTime,
      isOnline
    };
  }

  /**
   * 解除配对
   */
  static async unpair() {
    await localDb.setSyncMeta('paired_server_url', null);
    await localDb.setSyncMeta('paired_token', null);
    await localDb.setSyncMeta('paired_server_name', null);
    return true;
  }
}
