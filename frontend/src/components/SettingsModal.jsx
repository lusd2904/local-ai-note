import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Sparkles, Key, Check,
  Bot, Zap, Cpu, CheckCircle2, AlertCircle, RefreshCw 
} from 'lucide-react';
import { getAISettings, updateAISettings, analyzeContent, downloadBackup, restoreBackup } from '../api/client';

const DEFAULT_PROVIDERS = {
  claude: {
    provider: 'claude',
    name: 'Claude / Code',
    base_url: 'https://api.anthropic.com/v1',
    api_key: '',
    model_name: 'claude-3-7-sonnet-20250219',
    temperature: 0.7,
    models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
  },
  deepseek: {
    provider: 'deepseek',
    name: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    api_key: '',
    model_name: 'deepseek-chat',
    temperature: 0.7,
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  openai: {
    provider: 'openai',
    name: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model_name: 'gpt-4o',
    temperature: 0.7,
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo']
  },
  ollama: {
    provider: 'ollama',
    name: '本地离线 Ollama',
    base_url: 'http://localhost:11434/v1',
    api_key: 'ollama',
    model_name: 'qwen2.5:7b',
    temperature: 0.7,
    models: ['qwen2.5:7b', 'deepseek-r1:7b', 'llama3.2', 'mistral']
  }
};

export default function SettingsModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreInputRef = useRef(null);

  // 当前默认生效的渠道
  const [activeProvider, setActiveProvider] = useState('claude');
  // 当前正在查看/编辑的渠道
  const [viewingProvider, setViewingProvider] = useState('claude');
  // 所有渠道各自独立的配置字典
  const [providersConfig, setProvidersConfig] = useState(DEFAULT_PROVIDERS);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await getAISettings();
      if (data) {
        const active = data.active_provider || data.provider || 'claude';
        setActiveProvider(active);
        setViewingProvider(active);

        const merged = { ...DEFAULT_PROVIDERS };
        if (data.providers_config) {
          Object.keys(data.providers_config).forEach(k => {
            if (merged[k]) {
              merged[k] = { ...merged[k], ...data.providers_config[k] };
            } else {
              merged[k] = data.providers_config[k];
            }
          });
        }
        // 如果旧单一字段有值且当前渠道为空，填入
        if (data.api_key && !merged[active]?.api_key) {
          merged[active].api_key = data.api_key;
        }
        setProvidersConfig(merged);
      }
    } catch (err) {
      console.error('Failed to load AI settings', err);
    } finally {
      setLoading(false);
    }
  };

  // 更新当前查看渠道的某个字段
  const handleCurrentFieldChange = (field, value) => {
    setProvidersConfig(prev => ({
      ...prev,
      [viewingProvider]: {
        ...prev[viewingProvider],
        [field]: value
      }
    }));
  };

  // 设为当前默认生效渠道
  const handleSetAsActive = (providerKey) => {
    setActiveProvider(providerKey);
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    try {
      setLoading(true);
      const currentActiveCfg = providersConfig[activeProvider] || providersConfig['claude'];
      
      const payload = {
        active_provider: activeProvider,
        providers_config: providersConfig,
        provider: activeProvider,
        api_key: currentActiveCfg.api_key || '',
        base_url: currentActiveCfg.base_url || '',
        model_name: currentActiveCfg.model_name || '',
        temperature: currentActiveCfg.temperature !== undefined ? currentActiveCfg.temperature : 0.7
      };

      await updateAISettings(payload);
      await loadSettings();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      alert('保存设置失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // 先保存
      await handleSave();
      
      // 测试当前正在查看/编辑的渠道
      const res = await analyzeContent({
        content: '这是一条用于测试 AI 模型连接的本地测试文本。',
        action: 'summary'
      });
      setTestResult({ success: true, message: res.result || '连接成功！AI 响应正常。' });
    } catch (err) {
      setTestResult({ success: false, message: '连接测试失败: ' + (err.response?.data?.detail || err.message) });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  const currentCfg = providersConfig[viewingProvider] || DEFAULT_PROVIDERS.claude;
  const isCurrentActive = activeProvider === viewingProvider;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">AI 多模型与系统偏好设置</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* 渠道选择卡片 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                选择配置渠道 (各渠道 Key 独立保存)
              </label>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                默认生效: <strong className="font-bold">{DEFAULT_PROVIDERS[activeProvider]?.name || activeProvider}</strong>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {[
                { id: 'claude', name: 'Claude / Code', icon: Sparkles, color: 'purple' },
                { id: 'deepseek', name: 'DeepSeek', icon: Zap, color: 'blue' },
                { id: 'openai', name: 'OpenAI', icon: Bot, color: 'emerald' },
                { id: 'ollama', name: '本地 Ollama', icon: Cpu, color: 'amber' }
              ].map((p) => {
                const Icon = p.icon;
                const isViewing = viewingProvider === p.id;
                const isActive = activeProvider === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setViewingProvider(p.id)}
                    className={`relative flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition text-left ${
                      isViewing
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-300 font-bold shadow-sm ring-1 ring-blue-500'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                    )}
                    <Icon className="w-5 h-5 mb-1" />
                    <span>{p.name}</span>
                    <span className="text-[10px] text-gray-400 font-normal mt-0.5">
                      {isActive ? '🟢 生效中' : '点击编辑'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 当前渠道的独立详细配置 */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  {DEFAULT_PROVIDERS[viewingProvider]?.name} 配置参数
                </span>
                {isCurrentActive ? (
                  <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-[11px] font-semibold flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>当前全局默认生效</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetAsActive(viewingProvider)}
                    className="px-2.5 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 text-[11px] font-medium transition"
                  >
                    设为全局默认生效
                  </button>
                )}
              </div>
            </div>

            {/* API Base URL */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                API Base URL (接口接入点)
              </label>
              <input
                type="text"
                value={currentCfg.base_url || ''}
                onChange={(e) => handleCurrentFieldChange('base_url', e.target.value)}
                placeholder={DEFAULT_PROVIDERS[viewingProvider]?.base_url}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:text-white font-mono"
              />
            </div>

            {/* API Key */}
            {viewingProvider !== 'ollama' && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  API Key (密钥)
                </label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={currentCfg.api_key || ''}
                    onChange={(e) => handleCurrentFieldChange('api_key', e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg pl-9 pr-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:text-white font-mono"
                  />
                </div>
              </div>
            )}

            {/* 默认生效模型选择 */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                默认生效模型名称 (Model)
              </label>
              
              {/* 常用模型快捷标签 */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(DEFAULT_PROVIDERS[viewingProvider]?.models || []).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleCurrentFieldChange('model_name', m)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                      currentCfg.model_name === m
                        ? 'bg-blue-500 text-white font-bold shadow-xs'
                        : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={currentCfg.model_name || ''}
                onChange={(e) => handleCurrentFieldChange('model_name', e.target.value)}
                placeholder="例如: claude-3-7-sonnet-20250219 / deepseek-chat"
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none dark:text-white font-mono"
              />
            </div>

            {/* 🧠 深度思考推理强度 (Reasoning Effort / Extended Thinking) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>深度思考推理强度 (Reasoning Effort / Extended Thinking)</span>
                </label>
                <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-bold">
                  {currentCfg.reasoning_effort === 'disabled' ? '已关闭' : currentCfg.reasoning_effort === 'low' ? '⚡ 轻度' : currentCfg.reasoning_effort === 'high' ? '🔥 深度' : '⚖️ 中等'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'disabled', label: '🚫 关闭', desc: '极速响应' },
                  { id: 'low', label: '⚡ 轻度', desc: '1K Tokens' },
                  { id: 'medium', label: '⚖️ 中等', desc: '2K (推荐)' },
                  { id: 'high', label: '🔥 深度', desc: '4K 深度推理' }
                ].map((item) => {
                  const isSelected = (currentCfg.reasoning_effort || 'medium') === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleCurrentFieldChange('reasoning_effort', item.id)}
                      className={`p-2 rounded-lg border text-left transition flex flex-col items-center justify-center ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold shadow-xs'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <span className="text-xs">{item.label}</span>
                      <span className="text-[10px] text-gray-400 font-normal scale-90">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Temperature 温度 */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  生成创意度 (Temperature): {currentCfg.temperature !== undefined ? currentCfg.temperature : 0.7}
                </label>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={currentCfg.temperature !== undefined ? currentCfg.temperature : 0.7}
                onChange={(e) => handleCurrentFieldChange('temperature', parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 space-y-2">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">本地数据备份</div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">将笔记库、录音和图片打包下载；恢复会覆盖当前 data 目录。</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={backupBusy}
                onClick={async () => {
                  try {
                    setBackupBusy(true);
                    await downloadBackup();
                  } catch (err) {
                    alert('备份失败: ' + (err.response?.data?.detail || err.message));
                  } finally {
                    setBackupBusy(false);
                  }
                }}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs"
              >
                {backupBusy ? '处理中…' : '下载备份'}
              </button>
              <button
                type="button"
                onClick={() => restoreInputRef.current?.click()}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs"
              >
                从备份恢复
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".tar.gz,application/gzip"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!window.confirm('恢复将覆盖当前本地数据，确定继续？')) return;
                  try {
                    setBackupBusy(true);
                    await restoreBackup(file);
                    alert('恢复完成，请刷新页面。');
                    window.location.reload();
                  } catch (err) {
                    alert('恢复失败: ' + (err.response?.data?.detail || err.message));
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              />
            </div>
          </div>

          {/* 测试结果提示 */}
          {testResult && (
            <div className={`p-3.5 rounded-xl text-xs flex items-start space-x-2 ${
              testResult.success 
                ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' 
                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}

          {/* 保存成功浮条 */}
          {savedSuccess && (
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-xs flex items-center space-x-1.5 border border-green-200 dark:border-green-800 animate-fadeIn">
              <Check className="w-4 h-4" />
              <span>✅ 设置已永久保存！当前默认生效渠道为: <strong className="font-bold">{DEFAULT_PROVIDERS[activeProvider]?.name}</strong> ({providersConfig[activeProvider]?.model_name})</span>
            </div>
          )}

          {/* 底部按钮栏 */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || loading}
              className="px-3.5 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition"
            >
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-500" />}
              <span>{testing ? '正在测试...' : '测试当前渠道连通性'}</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
              >
                关闭
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center space-x-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>保存全部配置</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
