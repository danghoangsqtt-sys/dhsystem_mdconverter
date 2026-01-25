import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import InstallOllamaModal from './components/InstallOllamaModal';
import { convertPdfToMarkdownOllama, checkOllamaConnection, checkOllamaStatus } from './services/ollamaService';
import { ProcessingState, TEMPLATE_INSTRUCTION, AppSettings } from './types';
import { XCircle, AlertTriangle, X } from 'lucide-react';

const STORAGE_KEY_CONTENT = 'documark_autosave_content';
const STORAGE_KEY_FILENAME = 'documark_autosave_filename';
const STORAGE_KEY_SETTINGS = 'documark_settings';

const App: React.FC = () => {
  const [content, setContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("Untitled Document");
  
  // Settings State - Default to Ollama Only
  const [settings, setSettings] = useState<AppSettings>({
    ollamaModel: 'llama3',
    ollamaUrl: 'http://localhost:11434'
  });

  // Auto-save status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // View State
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showInstallOllama, setShowInstallOllama] = useState<boolean>(false);

  // --- MỚI: Trạng thái kết nối AI để truyền xuống Sidebar ---
  const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);

  // Confirmation Modal State
  const [showSavePrompt, setShowSavePrompt] = useState<boolean>(false);

  // History State
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUndoingRef = useRef<boolean>(false);

  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    error: null,
    success: false
  });

  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);

  // --- MỚI: Hàm kiểm tra AI để truyền xuống Sidebar ---
  const handleCheckAI = async () => {
    setConnectionStatus(null); // Đang kiểm tra
    const isInstalled = await checkOllamaStatus();
    setConnectionStatus(isInstalled);
    
    if (!isInstalled) {
        // Nếu muốn tự động hiện bảng cài đặt khi kiểm tra thất bại thì bỏ comment dòng dưới:
        // setShowInstallOllama(true);
    }
  };

  // Initialize content and settings
  useEffect(() => {
    // Load Content
    const savedContent = localStorage.getItem(STORAGE_KEY_CONTENT);
    const savedFileName = localStorage.getItem(STORAGE_KEY_FILENAME);

    if (savedContent !== null) {
      setContent(savedContent);
      setFileName(savedFileName || "Untitled Document");
      setHistory([savedContent]);
      setHistoryIndex(0);
    } else {
      const initialText = `# Chào mừng đến với DocuMark AI (Offline Mode)\n\nHãy tải lên file PDF từ thanh bên trái để bắt đầu chuyển đổi văn bản.\nỨng dụng này chạy hoàn toàn trên máy tính của bạn thông qua Ollama.\n\n${TEMPLATE_INSTRUCTION}`;
      setContent(initialText);
      setHistory([initialText]);
      setHistoryIndex(0);
    }

    // Load Settings
    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (savedSettings) {
        try {
            setSettings(JSON.parse(savedSettings));
        } catch (e) { console.error("Error loading settings", e); }
    }

    // Tự động kiểm tra kết nối khi mở app
    handleCheckAI();
  }, []);

  // Save Settings when changed
  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));
  };

  // Auto-save content
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY_CONTENT, content);
      localStorage.setItem(STORAGE_KEY_FILENAME, fileName);
      setSaveStatus('saved');
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [content, fileName]);

  // Handle Text Changes with Debounced History Push
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setSaveStatus('saving');

    if (isUndoingRef.current) return;

    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current);
    }

    historyTimeoutRef.current = setTimeout(() => {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(newContent);
        return newHistory;
      });
      setHistoryIndex(prev => prev + 1);
    }, 500);
  };

  const clearError = () => {
    setProcessingState(prev => ({ ...prev, error: null }));
  };

  const handleFileUpload = async (file: File) => {
    setProcessingState({ isProcessing: true, error: null, success: false });
    setFileName(file.name.replace('.pdf', '.md'));
    
    try {
      // 1. Check Connection
      const isRunning = await checkOllamaConnection(settings.ollamaUrl);
      
      // Cập nhật trạng thái hiển thị trên Sidebar
      setConnectionStatus(isRunning);

      if (!isRunning) {
          setShowInstallOllama(true);
          setProcessingState({ isProcessing: false, error: null, success: false });
          return;
      }

      // 2. Process with Ollama
      const markdown = await convertPdfToMarkdownOllama(file, settings);

      setContent(markdown);
      setSaveStatus('saving');
      
      setHistory([markdown]);
      setHistoryIndex(0);
      
      setProcessingState({ isProcessing: false, error: null, success: true });
    } catch (err: any) {
      let errorMessage = "Có lỗi xảy ra khi chuyển đổi file PDF.";
      if (err.message) errorMessage = err.message;
      
      setProcessingState({ 
        isProcessing: false, 
        error: errorMessage, 
        success: false 
      });
      console.error(err);
    }
  };

  const handleOpenMarkdown = async (file: File) => {
    setProcessingState({ isProcessing: false, error: null, success: false });
    setFileName(file.name);

    try {
      const text = await file.text();
      setContent(text);
      setSaveStatus('saving');
      setHistory([text]);
      setHistoryIndex(0);
    } catch (err) {
      setProcessingState({
        isProcessing: false,
        error: "Không thể đọc file Markdown này. File có thể bị lỗi hoặc định dạng không hỗ trợ.",
        success: false
      });
    }
  };

  const resetDocument = useCallback(() => {
    const blankContent = "";
    setContent(blankContent);
    setSaveStatus('saving');
    setFileName("Tai_lieu_moi.md");
    setHistory([blankContent]);
    setHistoryIndex(0);
    setProcessingState({ isProcessing: false, error: null, success: false });
    setShowSavePrompt(false);
    
    setTimeout(() => {
        if (textAreaRef.current) {
            textAreaRef.current.focus();
        }
    }, 0);
  }, []);

  const handleNewDocument = useCallback(() => {
    if (!content.trim()) {
      resetDocument();
      return;
    }
    setShowSavePrompt(true);
  }, [content, resetDocument]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoingRef.current = true;
      const newIndex = historyIndex - 1;
      const previousContent = history[newIndex];
      
      setContent(previousContent);
      setSaveStatus('saving');
      setHistoryIndex(newIndex);

      setTimeout(() => {
        isUndoingRef.current = false;
      }, 50);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoingRef.current = true;
      const newIndex = historyIndex + 1;
      const nextContent = history[newIndex];
      
      setContent(nextContent);
      setSaveStatus('saving');
      setHistoryIndex(newIndex);

      setTimeout(() => {
        isUndoingRef.current = false;
      }, 50);
    }
  }, [history, historyIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.key.toLowerCase() === 'y') || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    }
  };

  const handleSave = useCallback(() => {
    if (!content.trim()) {
      setProcessingState(prev => ({ ...prev, error: "Nội dung trống. Vui lòng nhập nội dung trước khi lưu." }));
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setProcessingState(prev => ({ ...prev, error: null }));
  }, [content, fileName]);

  const handleConfirmSave = useCallback(() => {
    handleSave();
    resetDocument();
  }, [handleSave, resetDocument]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
      .then(() => {
         setProcessingState(prev => ({ ...prev, error: null }));
      })
      .catch(err => {
        setProcessingState(prev => ({ ...prev, error: "Không thể sao chép nội dung vào clipboard." }));
      });
  }, [content]);

  const handleFormat = (tag: string, type: 'block' | 'wrap') => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = content;
    
    let newText = "";
    let newCursorPos = 0;

    if (type === 'block') {
      const before = text.substring(0, start);
      const after = text.substring(end);
      newText = before + tag + text.substring(start, end) + after;
      newCursorPos = start + tag.length;
    } else {
      const before = text.substring(0, start);
      const selected = text.substring(start, end);
      const after = text.substring(end);
      newText = before + tag + selected + tag + after;
      newCursorPos = end + tag.length * 2;
    }

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);
    
    setContent(newText);
    setSaveStatus('saving');
    setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(newText);
        return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <div className="flex h-screen w-screen bg-gray-100 overflow-hidden font-sans">
      <Sidebar 
        onFileUpload={handleFileUpload} 
        onOpenMarkdown={handleOpenMarkdown}
        onNewDocument={handleNewDocument}
        onShowHelp={() => setShowHelp(true)}
        isProcessing={processingState.isProcessing} 
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        // --- MỚI: Truyền trạng thái kết nối xuống Sidebar ---
        connectionStatus={connectionStatus}
        onCheckConnection={handleCheckAI}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Toolbar 
          onFormat={handleFormat} 
          onSave={handleSave} 
          onCopy={handleCopy}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          fileName={fileName}
          saveStatus={saveStatus}
        />

        {processingState.error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mx-4 mt-4 relative shadow-sm rounded-r flex justify-between items-start animate-fade-in" role="alert">
            <div>
              <p className="font-bold mb-1">Thông báo lỗi</p>
              <p className="text-sm">{processingState.error}</p>
            </div>
            <button onClick={clearError} className="text-red-400 hover:text-red-600 p-1">
              <XCircle size={20} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative bg-gray-100 p-4">
           {/* Editor Container */}
           <div className="h-full w-full max-w-7xl mx-auto flex gap-4 shadow-sm h-full">
             
             {/* Edit Pane - Full Width */}
             <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full">
               <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between">
                 <span>Soạn thảo Markdown</span>
                 <span className="text-gray-400">{content.length} ký tự</span>
               </div>
               <textarea
                  ref={textAreaRef}
                  className="flex-1 w-full p-6 resize-none outline-none font-mono text-sm leading-relaxed text-gray-800"
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  placeholder="Nhập nội dung văn bản..."
               />
             </div>

           </div>
        </div>
      </div>

      {/* Install Ollama Prompt */}
      {showInstallOllama && (
        <InstallOllamaModal 
          onClose={() => setShowInstallOllama(false)}
          onConfirm={() => setShowInstallOllama(false)}
          ollamaUrl={settings.ollamaUrl}
        />
      )}

      {/* Confirmation Modal */}
      {showSavePrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-200">
            <div className="flex items-center space-x-3 text-amber-600 mb-4">
              <AlertTriangle size={28} />
              <h3 className="text-lg font-bold text-gray-900">Tạo văn bản mới?</h3>
            </div>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Bạn có muốn lưu thay đổi hiện tại trước khi tạo tài liệu mới không?
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setShowSavePrompt(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Hủy
              </button>
              <button 
                onClick={resetDocument}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100"
              >
                Không lưu
              </button>
              <button 
                onClick={handleConfirmSave}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Lưu & Tạo mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[80vh] flex flex-col">
             <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">Hướng dẫn & Template</h3>
                <button onClick={() => setShowHelp(false)} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
             </div>
             <div className="p-6 overflow-y-auto flex-1">
               <p className="mb-4 text-gray-600">Dưới đây là cấu trúc Template chuẩn được sử dụng cho AI để chuyển đổi văn bản:</p>
               <pre className="bg-gray-50 p-4 rounded border border-gray-200 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                 {TEMPLATE_INSTRUCTION}
               </pre>
               <div className="mt-6">
                 <h4 className="font-bold text-gray-800 mb-2">Phím tắt</h4>
                 <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
                   <li><span className="font-semibold text-gray-800">Ctrl + Z</span>: Hoàn tác (Undo)</li>
                   <li><span className="font-semibold text-gray-800">Ctrl + Y</span> (hoặc Ctrl + Shift + Z): Làm lại (Redo)</li>
                 </ul>
                 <h4 className="font-bold text-gray-800 mt-4 mb-2">Cấu hình Ollama (Offline)</h4>
                 <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
                    <li>Đảm bảo đã cài đặt Ollama trên máy tính.</li>
                    <li>Chạy lệnh cho phép kết nối: <code className="bg-gray-200 px-1 rounded">OLLAMA_ORIGINS="*" ollama serve</code></li>
                    <li>Nhập tên model (ví dụ: <code>llama3</code>, <code>mistral</code>) trong phần Cấu hình Ollama ở menu trái.</li>
                 </ul>
               </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;