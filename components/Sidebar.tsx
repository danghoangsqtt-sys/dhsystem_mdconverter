import React, { useRef, useState, useEffect } from 'react';
import { Upload, HelpCircle, FilePlus, RefreshCcw, FolderOpen, ChevronDown, ChevronUp, Cpu, Settings, Cloud, Server, Eye, EyeOff, Save, Key } from 'lucide-react';
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
  const [showSettings, setShowSettings] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);

  // Local state for inputs to prevent auto-saving on every keystroke
  const [localGeminiKey, setLocalGeminiKey] = useState(settings.geminiApiKey);
  const [localOllamaModel, setLocalOllamaModel] = useState(settings.ollamaModel);
  const [localOllamaUrl, setLocalOllamaUrl] = useState(settings.ollamaUrl);

  // Sync with prop when it changes (e.g. initial load)
  useEffect(() => {
    setLocalGeminiKey(settings.geminiApiKey);
    setLocalOllamaModel(settings.ollamaModel);
    setLocalOllamaUrl(settings.ollamaUrl);
  }, [settings.geminiApiKey, settings.ollamaModel, settings.ollamaUrl]);

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

  const handleSaveGemini = () => {
    onUpdateSettings({
      ...settings,
      geminiApiKey: localGeminiKey
    });
  };

  const handleSaveOllama = () => {
    onUpdateSettings({
      ...settings,
      ollamaModel: localOllamaModel,
      ollamaUrl: localOllamaUrl
    });
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
          className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg border-2 border-dashed transition-all shadow-sm group
            ${isProcessing 
              ? 'border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed' 
              : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400'
            }
          `}
        >
          {isProcessing ? (
            <RefreshCcw size={20} className="animate-spin" />
          ) : (
            <Upload size={20} className="group-hover:scale-110 transition-transform" />
          )}
          <span className="font-semibold">{isProcessing ? 'Đang xử lý...' : 'Chọn PDF & Chuyển đổi'}</span>
        </button>
        
        <input type="file" ref={pdfInputRef} onChange={handlePdfChange} accept="application/pdf" className="hidden" />
        <input type="file" ref={mdInputRef} onChange={handleMdChange} accept=".md,.markdown,.txt" className="hidden" />
        
        <div className="flex items-center justify-center mt-3 space-x-1.5 text-xs text-gray-500">
           {settings.provider === 'ollama' ? (
             <>
               <Cpu size={14} className="text-gray-400" />
               <span>AI: <span className="font-semibold text-gray-700">Ollama Local</span></span>
             </>
           ) : (
             <>
               <Cloud size={14} className="text-blue-500" />
               <span>AI: <span className="font-semibold text-blue-700">Gemini 3.0</span></span>
             </>
           )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Chức năng</div>
        <SidebarItem icon={FilePlus} label="Văn bản mới" onClick={onNewDocument} />
        <SidebarItem icon={FolderOpen} label="Mở file Markdown" onClick={() => mdInputRef.current?.click()} />
        <SidebarItem icon={RefreshCcw} label="Chuyển đổi lại file PDF" disabled={isProcessing} onClick={() => pdfInputRef.current?.click()} />
        
        <div className="mt-4 border-t border-gray-100 pt-4">
            <button 
                onClick={() => setShowSettings(!showSettings)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600"
            >
                <div className="flex items-center space-x-2">
                    <Settings size={14} />
                    <span>Cấu hình AI</span>
                </div>
                {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            
            {showSettings && (
                <div className="px-4 py-3 space-y-4 bg-gray-50 mx-2 rounded-md mb-2 border border-gray-100 mt-2 animate-fade-in">
                    {/* Provider Toggle */}
                    <div className="flex bg-gray-200 rounded p-1 mb-3">
                        <button
                          onClick={() => onUpdateSettings({ ...settings, provider: 'ollama' })}
                          className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded text-xs font-medium transition-all ${
                            settings.provider === 'ollama' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <Server size={12} />
                          <span>Ollama</span>
                        </button>
                        <button
                          onClick={() => onUpdateSettings({ ...settings, provider: 'gemini' })}
                          className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded text-xs font-medium transition-all ${
                            settings.provider === 'gemini' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <Cloud size={12} />
                          <span>Gemini</span>
                        </button>
                    </div>

                    {settings.provider === 'ollama' ? (
                        <div className="animate-fade-in space-y-3">
                            <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1.5">Tên Model</label>
                                <input 
                                    type="text" 
                                    value={localOllamaModel}
                                    onChange={(e) => setLocalOllamaModel(e.target.value)}
                                    placeholder="e.g. llama3, mistral"
                                    className="w-full text-xs p-2 rounded border border-gray-300 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1.5">Địa chỉ Server (URL)</label>
                                <input 
                                    type="text" 
                                    value={localOllamaUrl}
                                    onChange={(e) => setLocalOllamaUrl(e.target.value)}
                                    className="w-full text-xs p-2 rounded border border-gray-300 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            
                            <button
                                onClick={handleSaveOllama}
                                className="w-full flex items-center justify-center space-x-2 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium transition-colors"
                            >
                                <Save size={14} />
                                <span>Lưu cấu hình Ollama</span>
                            </button>
                        </div>
                    ) : (
                        <div className="animate-fade-in space-y-3">
                             <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1.5 flex items-center gap-1">
                                    <Key size={10} /> Gemini API Key
                                </label>
                                <div className="relative">
                                    <input 
                                        type={showApiKey ? "text" : "password"} 
                                        value={localGeminiKey || ''}
                                        onChange={(e) => setLocalGeminiKey(e.target.value)}
                                        placeholder="Nhập API Key thủ công..."
                                        className="w-full text-xs p-2 rounded border border-gray-300 focus:border-blue-500 focus:outline-none pr-8 bg-white"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        title={showApiKey ? "Ẩn API Key" : "Hiện API Key"}
                                    >
                                        {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                             </div>

                            <button
                                onClick={handleSaveGemini}
                                className="w-full flex items-center justify-center space-x-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors shadow-sm"
                            >
                                <Save size={14} />
                                <span>Lưu & Áp dụng Key</span>
                            </button>

                            <div className="text-[10px] text-gray-500 leading-tight border-t border-gray-200 pt-2">
                                <p>Sử dụng model <strong>Gemini 3.0 Flash</strong>.</p>
                                <p className="mt-1 text-gray-400 italic">Nhập key thủ công, không sử dụng key mặc định.</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
        
        <SidebarItem icon={HelpCircle} label="Hướng dẫn" onClick={onShowHelp} />
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="bg-gray-100 rounded p-3 text-xs text-gray-600">
          <p className="font-bold mb-1">DocuMark AI</p>
          <p className="mb-2">Phiên bản 2.1.0</p>
          <p className="text-gray-400 font-semibold border-t border-gray-200 pt-2 mt-2">© dhsystem 2026</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;