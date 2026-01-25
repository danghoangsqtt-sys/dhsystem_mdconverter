import React, { useRef } from 'react';
import { Upload, FileText, Settings, HelpCircle, RefreshCw, CheckCircle2, XCircle, Power, ExternalLink } from 'lucide-react';
import { AppSettings } from '../types';

interface SidebarProps {
  onFileUpload: (file: File) => void;
  onOpenMarkdown: (file: File) => void;
  onNewDocument: () => void;
  onShowHelp: () => void;
  isProcessing: boolean;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  // Các props mới cho chức năng kiểm tra AI
  connectionStatus: boolean | null; // null: chưa check, true: ok, false: lỗi
  onCheckConnection: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  onFileUpload, 
  onOpenMarkdown, 
  onNewDocument,
  onShowHelp,
  isProcessing,
  settings,
  onUpdateSettings,
  connectionStatus,
  onCheckConnection
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const handleMdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onOpenMarkdown(e.target.files[0]);
    }
  };

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-full border-r border-slate-800 shadow-xl">
      {/* Header */}
      <div className="p-5 border-b border-slate-800">
        <h1 className="text-xl font-bold flex items-center gap-2 text-blue-400">
          <FileText size={24} />
          DocuMark AI
        </h1>
        <p className="text-xs text-slate-400 mt-1">Chuyển đổi PDF sang Markdown</p>
      </div>

      {/* Main Actions */}
      <div className="p-4 space-y-3 flex-1 overflow-y-auto">
        <button 
            onClick={onNewDocument}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg flex items-center justify-center gap-2 transition-all font-medium shadow-lg shadow-blue-900/20"
        >
          <FileText size={18} />
          Soạn thảo mới
        </button>

        <div className="pt-4 pb-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Tài liệu</h3>
            <div className="space-y-2">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className={`w-full border border-slate-700 hover:border-slate-500 hover:bg-slate-800 text-slate-300 p-3 rounded-lg flex items-center gap-3 transition-all text-sm ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Upload size={18} className="text-blue-400" />
                  {isProcessing ? 'Đang xử lý...' : 'Tải lên PDF'}
                </button>
                <input 
                  type="file" 
                  accept=".pdf" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileChange}
                />

                <button 
                  onClick={() => mdInputRef.current?.click()}
                  className="w-full border border-slate-700 hover:border-slate-500 hover:bg-slate-800 text-slate-300 p-3 rounded-lg flex items-center gap-3 transition-all text-sm"
                >
                  <FileText size={18} className="text-green-400" />
                  Mở file Markdown
                </button>
                <input 
                  type="file" 
                  accept=".md,.txt" 
                  ref={mdInputRef} 
                  className="hidden" 
                  onChange={handleMdChange}
                />
            </div>
        </div>

        {/* Settings Section */}
        <div className="pt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Cấu hình AI</h3>
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700">
                <div>
                    <label className="text-xs text-slate-400 block mb-1">Ollama Model</label>
                    <input 
                        type="text" 
                        value={settings.ollamaModel}
                        onChange={(e) => onUpdateSettings({...settings, ollamaModel: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        placeholder="VD: llama3"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-400 block mb-1">Server URL</label>
                    <input 
                        type="text" 
                        value={settings.ollamaUrl}
                        onChange={(e) => onUpdateSettings({...settings, ollamaUrl: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>
            </div>
        </div>
      </div>

      {/* --- STATUS WIDGET (MỚI) --- */}
      <div className="p-4 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Trạng thái hệ thống</span>
              <button onClick={onShowHelp} className="text-slate-500 hover:text-white transition-colors" title="Hướng dẫn">
                  <HelpCircle size={16} />
              </button>
          </div>
          
          <div className={`rounded-lg p-3 border ${connectionStatus === true ? 'bg-green-900/10 border-green-800/50' : connectionStatus === false ? 'bg-red-900/10 border-red-800/50' : 'bg-slate-800 border-slate-700'}`}>
              <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                      {connectionStatus === true ? (
                          <CheckCircle2 size={16} className="text-green-500" />
                      ) : connectionStatus === false ? (
                          <XCircle size={16} className="text-red-500" />
                      ) : (
                          <Power size={16} className="text-slate-400" />
                      )}
                      <span className={`text-sm font-medium ${connectionStatus === true ? 'text-green-400' : connectionStatus === false ? 'text-red-400' : 'text-slate-300'}`}>
                          {connectionStatus === true ? 'AI Sẵn sàng' : connectionStatus === false ? 'Mất kết nối' : 'Chưa kiểm tra'}
                      </span>
                  </div>
              </div>
              
              <button 
                  onClick={onCheckConnection}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs py-1.5 rounded transition-all active:scale-95"
              >
                  <RefreshCw size={12} className={connectionStatus === null ? "animate-spin" : ""} />
                  {connectionStatus === null ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
              </button>
              
              {connectionStatus === false && (
                  <div className="mt-2 pt-2 border-t border-red-900/30">
                      <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                          Tải Ollama <ExternalLink size={10} />
                      </a>
                  </div>
              )}
          </div>
          
          <div className="mt-3 text-[10px] text-slate-600 text-center">
              v1.0.0 • Offline Mode
          </div>
      </div>
    </div>
  );
};

export default Sidebar;