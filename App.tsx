import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import InstallOllamaModal from './components/InstallOllamaModal';
import Toast from './components/Toast';
import ProcessingStatus from './components/ProcessingStatus';
import { convertPdfToMarkdownOllama, checkOllamaConnection } from './services/ollamaService';
import { convertPdfToMarkdownGemini } from './services/geminiService';
import { ProcessingState, TEMPLATE_INSTRUCTION, AppSettings, ToastMessage, ProcessingStage } from './types';
import { AlertTriangle, X } from 'lucide-react';

const STORAGE_KEY_CONTENT = 'documark_autosave_content';
const STORAGE_KEY_FILENAME = 'documark_autosave_filename';
const STORAGE_KEY_SETTINGS = 'documark_settings';

const App: React.FC = () => {
  const [content, setContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("Untitled Document");

  const [settings, setSettings] = useState<AppSettings>({
    provider: 'ollama',
    ollamaModel: 'llama3',
    ollamaUrl: 'http://localhost:11434',
    geminiApiKey: ''
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showInstallOllama, setShowInstallOllama] = useState<boolean>(false);
  const [showSavePrompt, setShowSavePrompt] = useState<boolean>(false);

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUndoingRef = useRef<boolean>(false);

  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    stage: 'idle',
    message: '',
    logs: [],
    error: null,
    success: false
  });

  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    const savedContent = localStorage.getItem(STORAGE_KEY_CONTENT);
    const savedFileName = localStorage.getItem(STORAGE_KEY_FILENAME);

    if (savedContent !== null) {
      setContent(savedContent);
      setFileName(savedFileName || "Untitled Document");
      setHistory([savedContent]);
      setHistoryIndex(0);
    } else {
      // Nội dung mặc định mới, sạch sẽ hơn
      const initialText = `# Sẵn sàng chuyển đổi\n\nHãy tải file PDF lên để bắt đầu.\n\n${TEMPLATE_INSTRUCTION}`;
      setContent(initialText);
      setHistory([initialText]);
      setHistoryIndex(0);
    }

    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({
          provider: parsed.provider || 'ollama',
          ollamaModel: parsed.ollamaModel || 'llama3',
          ollamaUrl: parsed.ollamaUrl || 'http://localhost:11434',
          geminiApiKey: parsed.geminiApiKey || ''
        });
      } catch (e) { console.error("Error loading settings", e); }
    }
  }, []);

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));
    addToast('info', 'Đã lưu cấu hình hệ thống.');
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY_CONTENT, content);
      localStorage.setItem(STORAGE_KEY_FILENAME, fileName);
      setSaveStatus('saved');
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [content, fileName]);

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

  const updateProgress = (stage: ProcessingStage, message: string) => {
    setProcessingState(prev => ({
      ...prev,
      stage,
      message,
      logs: [...prev.logs, message]
    }));
  };

  const handleFileUpload = async (file: File) => {
    if (settings.provider === 'gemini' && !settings.geminiApiKey) {
      addToast('error', 'Vui lòng nhập Gemini API Key trong phần Cấu hình và nhấn Lưu.');
      return;
    }

    setProcessingState({
      isProcessing: true,
      stage: 'extracting',
      message: 'Khởi tạo hệ thống...',
      logs: ['Bắt đầu phiên làm việc mới.'],
      error: null,
      success: false
    });
    setFileName(file.name.replace('.pdf', '.md'));

    try {
      let markdown = "";

      if (settings.provider === 'ollama') {
        updateProgress('uploading', "Kiểm tra trạng thái Ollama Server...");
        const isRunning = await checkOllamaConnection(settings.ollamaUrl);
        if (!isRunning) {
          setShowInstallOllama(true);
          setProcessingState(prev => ({ ...prev, isProcessing: false }));
          addToast('error', 'Không thể kết nối Ollama. Vui lòng kiểm tra ứng dụng.');
          return;
        }
        markdown = await convertPdfToMarkdownOllama(file, settings, updateProgress);
      } else {
        markdown = await convertPdfToMarkdownGemini(file, settings.geminiApiKey, updateProgress);
      }

      setContent(markdown);
      setSaveStatus('saving');
      setHistory([markdown]);
      setHistoryIndex(0);

      setProcessingState(prev => ({
        ...prev,
        isProcessing: false,
        stage: 'complete',
        success: true
      }));
      addToast('success', 'Chuyển đổi văn bản thành công!');
    } catch (err: any) {
      let errorMessage = "Có lỗi xảy ra khi xử lý tài liệu.";
      if (err.message) errorMessage = err.message;

      setProcessingState(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage,
        success: false
      }));
      addToast('error', errorMessage);
      console.error(err);
    }
  };

  const handleOpenMarkdown = async (file: File) => {
    try {
      const text = await file.text();
      setContent(text);
      setFileName(file.name);
      setSaveStatus('saving');
      setHistory([text]);
      setHistoryIndex(0);
      addToast('success', `Đã mở file: ${file.name}`);
    } catch (err) {
      addToast('error', "Không thể đọc định dạng file này.");
    }
  };

  const resetDocument = useCallback(() => {
    const blankContent = "";
    setContent(blankContent);
    setSaveStatus('saving');
    setFileName("Tai_lieu_moi.md");
    setHistory([blankContent]);
    setHistoryIndex(0);
    setProcessingState({
      isProcessing: false,
      stage: 'idle',
      message: '',
      logs: [],
      error: null,
      success: false
    });
    setShowSavePrompt(false);
    addToast('info', 'Đã tạo tài liệu trắng.');

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
      addToast('info', 'Đã hoàn tác.');
      setTimeout(() => { isUndoingRef.current = false; }, 50);
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
      addToast('info', 'Đã làm lại.');
      setTimeout(() => { isUndoingRef.current = false; }, 50);
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
      addToast('error', "Nội dung trống, không thể lưu.");
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
    addToast('success', 'Đã tải xuống file Markdown.');
  }, [content, fileName]);

  const handleConfirmSave = useCallback(() => {
    handleSave();
    resetDocument();
  }, [handleSave, resetDocument]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
      .then(() => {
        addToast('success', 'Đã sao chép vào bộ nhớ đệm.');
      })
      .catch(err => {
        addToast('error', "Lỗi sao chép.");
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
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
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

        {/* Toast Notifications */}
        <Toast toasts={toasts} removeToast={removeToast} />

        {/* Processing Status Overlay with Logs */}
        <ProcessingStatus
          isProcessing={processingState.isProcessing}
          stage={processingState.stage}
          message={processingState.message}
          logs={processingState.logs}
        />

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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;