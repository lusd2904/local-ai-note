import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
          <div className="max-w-md w-full p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-red-200 dark:border-red-900/50 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mx-auto text-red-500">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold">视图渲染遇到小问题</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded max-h-24 overflow-y-auto">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg shadow transition flex items-center space-x-1.5 mx-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>刷新恢复</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
