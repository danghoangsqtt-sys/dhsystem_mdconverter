import React, { useRef, useState } from 'react';
import { Upload, HelpCircle, FilePlus, RefreshCcw, FolderOpen, ChevronDown, ChevronUp, Cpu, Settings } from 'lucide-react';
import { AppSettings } from '../types';

interface SidebarProps {
  onFileUpload: (file: File) => void;
  onOpenMarkdown: (file: File) => void;
  onNewDocument: () => void;
  onShowHelp: () => void;
  isProcessing: boolean;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  onFileUpload, 
  onOpenMarkdown, 
  onNewDocument, 
  onShowHelp, 
  isProcessing,
  settings,
  onUpdateSettings
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(true); // Default to open since settings are important for local AI

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = '';
    }
  };

  const handleMdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onOpenMarkdown(e.target.files[0]);
    }
    if (mdInputRef.current) {
      mdInputRef.current.value = '';
    }
  };

  const SidebarItem = ({ icon: Icon, label, onClick, disabled = false, active = false }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium transition-colors 
        ${active ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="w-72 bg-white border-r border-gray-200 h-full flex flex-col flex-shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="p-6">
        <button 
          onClick={() => pdfInputRef.current?.click()}
          disabled={isProcessing}
          className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg border-2 border-dashed transition-all shadow-sm
            ${isProcessing 
              ? 'border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed' 
              : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400'
            }
          `}
        >
          {isProcessing ? (
            <RefreshCcw size={20} className="animate-spin" />
          ) : (
            <Upload size={20} />
          )}
          <span className="font-semibold">{isProcessing ? 'Đang xử lý...' : 'Chọn PDF'}</span>
        </button>
        
        <input type="file" ref={pdfInputRef} onChange={handlePdfChange} accept="application/pdf" className="hidden" />
        <input type="file" ref={mdInputRef} onChange={handleMdChange} accept=".md,.markdown,.txt" className="hidden" />
        
        <div className="flex items-center justify-center mt-3 space-x-1.5 text-xs text-gray-500">
           <Cpu size={14} className="text-gray-400" />
           <span>Local AI: <span className="font-semibold text-gray-700">{settings.ollamaModel}</span></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Chức năng</div>
        <SidebarItem icon={FilePlus} label="Văn bản mới" onClick={onNewDocument} />
        <SidebarItem icon={FolderOpen} label="Mở file Markdown" onClick={() => mdInputRef.current?.click()} />
        <SidebarItem icon={RefreshCcw} label="Chuyển đổi lại" disabled={isProcessing} onClick={() => pdfInputRef.current?.click()} />
        
        <div className="mt-4 border-t border-gray-100 pt-4">
            <button 
                onClick={() => setShowSettings(!showSettings)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
            >
                <div className="flex items-center space-x-2">
                    <Settings size={14} />
                    <span>Cấu hình Ollama</span>
                </div>
                {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            
            {showSettings && (
                <div className="px-4 py-3 space-y-3 bg-gray-50 mx-2 rounded-md mb-2 border border-gray-100 mt-2">
                    <div className="animate-fade-in">
                        <label className="text-xs font-medium text-gray-600 block mb-1.5">Tên Model</label>
                        <input 
                            type="text" 
                            value={settings.ollamaModel}
                            onChange={(e) => onUpdateSettings({...settings, ollamaModel: e.target.value})}
                            placeholder="e.g. llama3, mistral"
                            className="w-full text-xs p-2 rounded border border-gray-300 focus:border-blue-500 focus:outline-none"
                        />
                        <label className="text-xs font-medium text-gray-600 block mt-3 mb-1.5">Địa chỉ Server (URL)</label>
                        <input 
                            type="text" 
                            value={settings.ollamaUrl}
                            onChange={(e) => onUpdateSettings({...settings, ollamaUrl: e.target.value})}
                            className="w-full text-xs p-2 rounded border border-gray-300 focus:border-blue-500 focus:outline-none"
                        />
                        <div className="mt-2 text-[10px] text-gray-500 leading-tight">
                            <p className="mb-1">Cần chạy lệnh sau trong Terminal:</p>
                            <code className="block bg-gray-200 px-1 py-1 rounded font-mono break-all text-gray-700">OLLAMA_ORIGINS="*" ollama serve</code>
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        <SidebarItem icon={HelpCircle} label="Hướng dẫn" onClick={onShowHelp} />
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="bg-gray-100 rounded p-3 text-xs text-gray-600">
          <p className="font-bold mb-1">DocuMark AI</p>
          <p className="mb-2">Phiên bản 2.0.0 (Local Only)</p>
          <p className="text-gray-400 font-semibold border-t border-gray-200 pt-2 mt-2">© dhsystem 2026</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;