import React, { useState } from 'react';
import { Lock, Unlock, Eye, EyeOff, X } from 'lucide-react';

export default function LockModal({ isOpen, onClose, onConfirm, mode = 'lock' }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const isLockMode = mode === 'lock';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isLockMode) {
      if (password.length < 4) {
        setError('密码长度至少为 4 位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
    } else {
      if (!password) {
        setError('请输入密码');
        return;
      }
    }

    setLoading(true);
    try {
      await onConfirm(password);
      setPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || '操作失败，请检查密码');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setPassword('');
    setConfirmPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 relative">
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-3">
            {isLockMode ? <Lock className="w-6 h-6 text-amber-600" /> : <Unlock className="w-6 h-6 text-amber-600" />}
          </div>
          <h2 className="text-xl font-semibold text-slate-800">
            {isLockMode ? '设置独立密码' : '解除密码锁定'}
          </h2>
          <p className="text-sm text-slate-500 mt-1 text-center">
            {isLockMode
              ? '为当前笔记设置独立密码，锁定后需验证才可查看正文。'
              : '输入当前笔记密码以解除锁定。'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isLockMode ? '新密码 (至少4位)' : '当前密码'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLockMode ? '输入密码' : '输入笔记密码'}
                autoFocus
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isLockMode && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">确认密码</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
              />
            </div>
          )}

          {error && <div className="text-sm text-red-500 mt-1">{error}</div>}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? '处理中...' : '确认'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
