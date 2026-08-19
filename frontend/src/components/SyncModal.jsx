import React, { useState, useEffect } from 'react';
import { 
  X, QrCode, Smartphone, Laptop, RefreshCw, CheckCircle2, 
  AlertCircle, Copy, Check, Wifi, ArrowRightLeft, ShieldCheck, Unlink
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SyncService } from '../services/syncService';

export default function SyncModal({ isOpen, onClose, onSyncComplete }) {
  const [activeTab, setActiveTab] = useState('mac'); // 'mac' | 'ios'
  const [syncInfo, setSyncInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // iOS 客户端配对状态
  const [clientServerUrl, setClientServerUrl] = useState('');
  const [clientPairCode, setClientPairCode] = useState('');
  const [syncStatus, setSyncStatus] = useState({ isPaired: false, serverUrl: '', lastSyncTime: null, isOnline: false });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // 1. 获取 Mac 服务端信息
      const info = await SyncService.getMacSyncInfo();
      if (info) {
        setSyncInfo(info);
        if (!clientServerUrl) {
          setClientServerUrl(`http://${info.server_ip}:${info.port}`);
        }
      }

      // 2. 获取客户端配对状态
      const status = await SyncService.getSyncStatus();
      setSyncStatus(status);
      if (status.isPaired) {
        setActiveTab('ios');
      }
    } catch (err) {
      console.error('Failed to load sync info:', err);
    } finally {
      setLoading(false);
    }
  };

  // 复制配对码
  const handleCopyCode = () => {
    if (!syncInfo?.pairing_code) return;
    navigator.clipboard.writeText(syncInfo.pairing_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // iOS 客户端发起配对
  const handlePairSubmit = async (e) => {
    e.preventDefault();
    if (!clientServerUrl.trim() || !clientPairCode.trim()) {
      setErrorMsg('请完整填写 Mac 局域网地址和 6 位配对码');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await SyncService.pairWithMac(clientServerUrl.trim(), clientPairCode.trim());
      const status = await SyncService.getSyncStatus();
      setSyncStatus(status);
      setClientPairCode('');
      // 配对成功后自动触发一次双向同步
      handleRunTwoWaySync();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.message || '配对失败，请检查两端是否在同一 Wi-Fi');
    } finally {
      setLoading(false);
    }
  };

  // 执行一键双向同步
  const handleRunTwoWaySync = async () => {
    setSyncing(true);
    setErrorMsg('');
    setSyncResult(null);
    try {
      const res = await SyncService.executeTwoWaySync();
      setSyncResult(res);
      const status = await SyncService.getSyncStatus();
      setSyncStatus(status);
      if (onSyncComplete) {
        onSyncComplete(res);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.message || '同步失败，请确保 Mac 服务端已启动');
    } finally {
      setSyncing(false);
    }
  };

  // 解除配对
  const handleUnpair = async () => {
    if (window.confirm('确定要解除与当前 Mac 工作站的配对吗？')) {
      await SyncService.unpair();
      const status = await SyncService.getSyncStatus();
      setSyncStatus(status);
      setSyncResult(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                多端数据同步与配对
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                同一 Wi-Fi 下免公网直接互通与增量双向同步
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 模式选择 Tab */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 px-6 pt-3 bg-gray-50/30 dark:bg-gray-900">
          <button
            onClick={() => setActiveTab('mac')}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'mac'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>macOS 工作站 (服务端)</span>
          </button>

          <button
            onClick={() => setActiveTab('ios')}
            className={`flex items-center space-x-2 pb-3 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'ios'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>iOS / 移动端 (客户端)</span>
            {syncStatus.isPaired && (
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            )}
          </button>
        </div>

        {/* 主内容区域 */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* TAB 1: macOS 服务端展示 */}
          {activeTab === 'mac' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40">
                <Wifi className="w-4 h-4 shrink-0" />
                <span>请确保 iPhone 与当前 Mac 连接在<strong>同一个 Wi-Fi 无线局域网</strong>。</span>
              </div>

              {/* 二维码与配对码卡片 */}
              {syncInfo ? (
                <div className="flex flex-col items-center justify-center p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 space-y-4">
                  {/* 二维码 */}
                  <div className="p-3 bg-white rounded-xl shadow-md border border-gray-100">
                    <QRCodeSVG
                      value={syncInfo.qr_data || ''}
                      size={170}
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  {/* 6位配对码 */}
                  <div className="text-center space-y-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      或在手机端输入 6 位配对码：
                    </div>
                    <div className="inline-flex items-center space-x-2 px-4 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-inner">
                      <span className="text-2xl font-extrabold tracking-widest font-mono text-blue-600 dark:text-blue-400">
                        {syncInfo.pairing_code}
                      </span>
                      <button
                        onClick={handleCopyCode}
                        className="p-1 text-gray-400 hover:text-blue-500 rounded"
                        title="复制配对码"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* 本机局域网地址 */}
                  <div className="text-[11px] text-gray-400 font-mono text-center">
                    局域网直连地址: http://{syncInfo.server_ip}:{syncInfo.port}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-gray-400 text-xs animate-pulse">
                  正在获取局域网同步网络凭证...
                </div>
              )}
            </div>
          )}

          {/* TAB 2: iOS 移动端配对与同步 */}
          {activeTab === 'ios' && (
            <div className="space-y-4">
              {/* 如果已配对 */}
              {syncStatus.isPaired ? (
                <div className="space-y-4">
                  {/* 配对成功状态卡片 */}
                  <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/60 flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                          <span>已配对 {syncStatus.serverName || 'Mac 工作站'}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                            已受信
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                          {syncStatus.serverUrl}
                        </p>
                        {syncStatus.lastSyncTime && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            上次同步: {new Date(syncStatus.lastSyncTime).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={handleUnpair}
                      className="text-xs text-gray-400 hover:text-red-500 p-1 flex items-center space-x-1"
                      title="解除配对"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>解绑</span>
                    </button>
                  </div>

                  {/* 一键同步按钮 */}
                  <button
                    onClick={handleRunTwoWaySync}
                    disabled={syncing}
                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 active:scale-[0.99] disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center space-x-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    <span>{syncing ? '正在进行增量双向同步...' : '⚡️ 立即执行双向数据同步'}</span>
                  </button>

                  {/* 同步结果展示 */}
                  {syncResult && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 space-y-1 animate-fadeIn">
                      <div className="font-bold flex items-center space-x-1">
                        <Check className="w-4 h-4 text-green-500" />
                        <span>同步成功！数据已完全对齐</span>
                      </div>
                      <div className="text-[11px] text-gray-600 dark:text-gray-400 space-y-0.5 pl-5">
                        <p>• 推送到 Mac: 新增 {syncResult.stats?.pushed_notes_inserted || 0} 篇，更新 {syncResult.stats?.pushed_notes_updated || 0} 篇</p>
                        <p>• 从 Mac 拉取: 同步 {syncResult.stats?.pulled_notes_count || 0} 篇笔记，{syncResult.stats?.pulled_notebooks_count || 0} 个笔记本分类</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* 未配对表单 */
                <form onSubmit={handlePairSubmit} className="space-y-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    在下方输入 Mac 屏幕上显示的局域网直连地址与 6 位配对码，即可完成设备信任握手：
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Mac 局域网服务地址
                      </label>
                      <input
                        type="text"
                        value={clientServerUrl}
                        onChange={(e) => setClientServerUrl(e.target.value)}
                        placeholder="例如: http://192.168.1.100:8008"
                        className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        6 位配对安全码
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={clientPairCode}
                        onChange={(e) => setClientPairCode(e.target.value.toUpperCase())}
                        placeholder="例如: 849201"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-blue-500 font-mono tracking-widest uppercase font-bold"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow transition flex items-center justify-center space-x-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{loading ? '正在验证配对...' : '立即验证并配对设备'}</span>
                  </button>
                </form>
              )}

              {/* 错误提示 */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-center space-x-1.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between text-xs text-gray-400">
          <span>🔒 点对点局域网传输，无需公网服务器</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
