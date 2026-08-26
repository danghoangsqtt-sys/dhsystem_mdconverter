import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 border border-neutral-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <AlertTriangle size={28} />
              <h3 className="text-lg font-semibold text-neutral-800">Đã xảy ra lỗi</h3>
            </div>

            <p className="text-neutral-600 mb-4 leading-relaxed">
              Ứng dụng gặp sự cố không mong muốn. Bạn có thể thử lại hoặc tải lại trang.
            </p>

            {this.state.error && (
              <details className="mb-4 p-3 bg-neutral-100 rounded-lg text-xs text-neutral-500 max-h-40 overflow-auto">
                <summary className="font-medium text-neutral-700 cursor-pointer mb-1">Chi tiết lỗi</summary>
                <pre>{this.state.error.message}</pre>
                {this.state.error.stack && (
                  <pre className="mt-1">{this.state.error.stack}</pre>
                )}
              </details>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-md hover:bg-neutral-200 transition-colors"
              >
                Thử lại
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                <RefreshCw size={14} className="inline mr-1" /> Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
