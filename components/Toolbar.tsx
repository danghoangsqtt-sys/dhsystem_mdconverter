import React, { useState } from 'react';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Heading1, 
  Heading2, 
  Heading3,
  Quote, 
  FileText,
  Save,
  Copy,
  Check,
  Undo,
  Redo,
  Loader2
} from 'lucide-react';

interface ToolbarProps {
  onFormat: (tag: string, type: 'block' | 'wrap') => void;
  onSave: () => void;
  onCopy: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fileName: string;
  saveStatus: 'saved' | 'saving';
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  onFormat, 
  onSave, 
  onCopy, 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo, 
  fileName,
  saveStatus
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const Button = ({ onClick, icon: Icon, title, active = false, disabled = false }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded transition-colors 
        ${disabled ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-200 text-gray-700'}
        ${active ? 'bg-blue-100 text-blue-700 shadow-inner' : ''}
      `}
    >
      <Icon size={18} />
    </button>
  );

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center px-4 justify-between shadow-sm flex-shrink-0 z-10">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 mr-4 border-r pr-4 border-gray-300">
          <div className="bg-blue-600 p-1.5 rounded text-white">
            <FileText size={20} />
          </div>
          <div>
             <h1 className="font-semibold text-sm text-gray-800 leading-tight">DocuMark</h1>
             <div className="flex items-center space-x-2">
                <p className="text-xs text-gray-500 truncate max-w-[150px]">{fileName}</p>
                <span className="text-gray-300">|</span>
                <div className="flex items-center text-xs text-gray-400">
                    {saveStatus === 'saving' ? (
                       <>
                         <Loader2 size={12} className="animate-spin mr-1" />
                         <span>Đang lưu...</span>
                       </>
                    ) : (
                       <>
                         <Check size={12} className="mr-1 text-green-500" />
                         <span>Đã lưu</span>
                       </>
                    )}
                </div>
             </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <Button onClick={onUndo} icon={Undo} title="Hoàn tác (Ctrl+Z)" disabled={!canUndo} />
          <Button onClick={onRedo} icon={Redo} title="Làm lại (Ctrl+Y)" disabled={!canRedo} />
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
          
          <Button onClick={() => onFormat('# ', 'block')} icon={Heading1} title="Tiêu đề 1" />
          <Button onClick={() => onFormat('## ', 'block')} icon={Heading2} title="Tiêu đề 2" />
          <Button onClick={() => onFormat('### ', 'block')} icon={Heading3} title="Tiêu đề 3" />
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
          <Button onClick={() => onFormat('**', 'wrap')} icon={Bold} title="In đậm" />
          <Button onClick={() => onFormat('_', 'wrap')} icon={Italic} title="In nghiêng" />
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
          <Button onClick={() => onFormat('- ', 'block')} icon={List} title="Danh sách" />
          <Button onClick={() => onFormat('1. ', 'block')} icon={ListOrdered} title="Danh sách số" />
          <Button onClick={() => onFormat('> ', 'block')} icon={Quote} title="Trích dẫn" />
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <button 
          onClick={handleCopy}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm border ${
            copied 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
          }`}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
        </button>

        <button 
          onClick={onSave}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
        >
          <Save size={16} />
          <span>Lưu file</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;