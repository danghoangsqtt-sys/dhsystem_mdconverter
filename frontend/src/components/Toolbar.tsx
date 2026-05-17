import React, { useState } from 'react';
import { 
  FileText,
  Save,
  Copy,
  Check,
  Loader2
} from 'lucide-react';

interface ToolbarProps {
  onSave: () => void;
  onCopy: () => void;
  fileName: string;
  saveStatus: 'saved' | 'saving';
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  onSave, 
  onCopy, 
  fileName,
  saveStatus
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-16 bg-white border-b border-gray-100 flex items-center px-4 justify-between shadow-sm flex-shrink-0 z-10">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 mr-4">
          <div className="bg-blue-600 p-1.5 rounded text-white shadow-sm">
            <FileText size={18} strokeWidth={1.5} />
          </div>
          <div>
             <h1 className="font-semibold text-[13px] text-gray-800 leading-tight">DocuMark</h1>
             <div className="flex items-center space-x-2">
                <p className="text-[11px] text-gray-500 truncate max-w-[150px]">{fileName}</p>
                <span className="text-gray-300">|</span>
                <div className="flex items-center text-[11px] text-gray-400">
                    {saveStatus === 'saving' ? (
                       <>
                         <Loader2 size={10} className="animate-spin mr-1" />
                         <span>Đang lưu...</span>
                       </>
                    ) : (
                       <>
                         <Check size={10} className="mr-1 text-green-500" />
                         <span>Đã lưu</span>
                       </>
                    )}
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button 
          onClick={handleCopy}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border ${
            copied 
              ? 'bg-green-50 text-green-700 border-green-200 shadow-sm' 
              : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm'
          }`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
        </button>

        <button 
          onClick={onSave}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors shadow-sm"
        >
          <Save size={14} />
          <span>Lưu file</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;