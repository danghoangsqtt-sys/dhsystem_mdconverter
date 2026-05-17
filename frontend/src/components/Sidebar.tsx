import React, { useRef } from 'react';
import { Upload, HelpCircle, FilePlus, RefreshCcw, FolderOpen, Box } from 'lucide-react';

interface SidebarProps {
  onFileUpload: (file: File) => void;
  onOpenMarkdown: (file: File) => void;
  onNewDocument: () => void;
  onShowHelp: () => void;
  isProcessing: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  onFileUpload, 
  onOpenMarkdown, 
  onNewDocument, 
  onShowHelp, 
  isProcessing
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);

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
      className={`w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium transition-colors rounded-md
        ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <Icon size={18} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="w-64 bg-[#fbfbfa] border-r border-[#e5e7eb] h-full flex flex-col flex-shrink-0 z-20">
      <div className="p-4 border-b border-transparent">
        <button 
          onClick={() => pdfInputRef.current?.click()}
          disabled={isProcessing}
          className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-md border transition-all shadow-sm group
            ${isProcessing 
              ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed' 
              : 'border-[#e5e7eb] bg-white text-gray-800 hover:bg-gray-50'
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
        
        <input type="file" ref={pdfInputRef} onChange={handlePdfChange} accept=".pdf,.docx,.doc,.pptx,.html" className="hidden" />
        <input type="file" ref={mdInputRef} onChange={handleMdChange} accept=".md,.markdown,.txt" className="hidden" />
        
        <div className="flex items-center justify-center mt-3 space-x-1.5 text-xs text-gray-500">
             <Box size={14} className="text-blue-500" />
             <span>Core: <span className="font-semibold text-blue-700">DocuMark Engine v2</span></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 custom-scrollbar space-y-1">
        <div className="px-2 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Features</div>
        <SidebarItem icon={FilePlus} label="New Document" onClick={onNewDocument} />
        <SidebarItem icon={FolderOpen} label="Open Markdown" onClick={() => mdInputRef.current?.click()} />
        <SidebarItem icon={RefreshCcw} label="Reprocess PDF" disabled={isProcessing} onClick={() => pdfInputRef.current?.click()} />
        <div className="mt-2 pt-2 border-t border-gray-100">
           <SidebarItem icon={HelpCircle} label="Hướng dẫn" onClick={onShowHelp} />
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="bg-gray-100 rounded p-3 text-xs text-gray-600">
          <p className="font-bold mb-1">DocuMark AI Web</p>
          <p className="mb-2">Phiên bản 3.0.0 (FastAPI)</p>
          <p className="text-gray-400 font-semibold border-t border-gray-200 pt-2 mt-2">© dhsystem 2026</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;