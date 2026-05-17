import React, { useEffect, useCallback, useReducer } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { Agentation } from 'agentation';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import Toast from './components/Toast';
import ProcessingStatus from './components/ProcessingStatus';
import { uploadAndConvertFile } from './services/api';
import type { ProcessingState, ToastMessage } from './types';
import { AlertTriangle, X } from 'lucide-react';

const STORAGE_KEY_CONTENT = 'documark_autosave_content';
const STORAGE_KEY_FILENAME = 'documark_autosave_filename';

interface AppState {
  content: string;
  fileName: string;
  toasts: ToastMessage[];
  saveStatus: 'saved' | 'saving';
  showHelp: boolean;
  showSavePrompt: boolean;
  processingState: ProcessingState;
}

type AppAction =
  | { type: 'SET_CONTENT'; payload: string }
  | { type: 'SET_FILE_NAME'; payload: string }
  | { type: 'ADD_TOAST'; payload: ToastMessage }
  | { type: 'REMOVE_TOAST'; payload: number }
  | { type: 'SET_SAVE_STATUS'; payload: 'saved' | 'saving' }
  | { type: 'SET_SHOW_HELP'; payload: boolean }
  | { type: 'SET_SHOW_SAVE_PROMPT'; payload: boolean }
  | { type: 'SET_PROCESSING_STATE'; payload: Partial<ProcessingState> }
  | { type: 'RESET_DOCUMENT'; payload: { content: string, fileName: string } }
  | { type: 'LOAD_SAVED_STATE'; payload: { content: string, fileName: string } };

const initialState: AppState = {
  content: "",
  fileName: "Untitled Document",
  toasts: [],
  saveStatus: 'saved',
  showHelp: false,
  showSavePrompt: false,
  processingState: {
    isProcessing: false,
    stage: 'idle',
    message: '',
    logs: [],
    error: null,
    success: false
  }
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONTENT':
      return { ...state, content: action.payload, saveStatus: 'saving' };
    case 'SET_FILE_NAME':
      return { ...state, fileName: action.payload };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };
    case 'SET_SHOW_HELP':
      return { ...state, showHelp: action.payload };
    case 'SET_SHOW_SAVE_PROMPT':
      return { ...state, showSavePrompt: action.payload };
    case 'SET_PROCESSING_STATE':
      return { ...state, processingState: { ...state.processingState, ...action.payload } };
    case 'RESET_DOCUMENT':
      return {
        ...state,
        content: action.payload.content,
        fileName: action.payload.fileName,
        saveStatus: 'saving',
        showSavePrompt: false,
        processingState: initialState.processingState
      };
    case 'LOAD_SAVED_STATE':
      return {
        ...state,
        content: action.payload.content,
        fileName: action.payload.fileName
      };
    default:
      return state;
  }
}

const App: React.FC = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    dispatch({ type: 'ADD_TOAST', payload: { id: Date.now(), type, message } });
  }, []);

  const removeToast = useCallback((id: number) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  useEffect(() => {
    const savedContent = localStorage.getItem(STORAGE_KEY_CONTENT);
    const savedFileName = localStorage.getItem(STORAGE_KEY_FILENAME);

    if (savedContent !== null) {
      dispatch({
        type: 'LOAD_SAVED_STATE',
        payload: { content: savedContent, fileName: savedFileName || "Untitled Document" }
      });
    } else {
      const initialText = `# Sẵn sàng chuyển đổi\n\nHãy tải file PDF lên để bắt đầu chuyển đổi sang Markdown bằng DocuMark AI Core.\n`;
      dispatch({
        type: 'LOAD_SAVED_STATE',
        payload: { content: initialText, fileName: "Untitled Document" }
      });
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY_CONTENT, state.content);
      localStorage.setItem(STORAGE_KEY_FILENAME, state.fileName);
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [state.content, state.fileName]);

  const handleContentChange = useCallback((newContent: string) => {
    dispatch({ type: 'SET_CONTENT', payload: newContent });
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    dispatch({
      type: 'SET_PROCESSING_STATE',
      payload: {
        isProcessing: true,
        stage: 'uploading',
        message: 'Đang tải file lên server...',
        logs: ['Bắt đầu tải file lên máy chủ DocuMark AI.'],
        error: null,
        success: false
      }
    });
    
    const newFileName = file.name.replace(/\.[^/.]+$/, ".md");
    dispatch({ type: 'SET_FILE_NAME', payload: newFileName });

    try {
      dispatch({
        type: 'SET_PROCESSING_STATE',
        payload: { stage: 'extracting', message: "Backend đang trích xuất bố cục và nội dung..." }
      });
      
      const response = await uploadAndConvertFile(file);
      
      dispatch({ type: 'SET_CONTENT', payload: response.markdown });
      dispatch({
        type: 'SET_PROCESSING_STATE',
        payload: { isProcessing: false, stage: 'complete', success: true }
      });
      
      addToast('success', 'Chuyển đổi văn bản thành công!');
    } catch (err: any) {
      let errorMessage = "Có lỗi xảy ra khi xử lý tài liệu.";
      if (err.message) errorMessage = err.message;

      dispatch({
        type: 'SET_PROCESSING_STATE',
        payload: { isProcessing: false, error: errorMessage, success: false }
      });
      addToast('error', errorMessage);
      console.error(err);
    }
  }, [addToast]);

  const handleOpenMarkdown = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      dispatch({
        type: 'LOAD_SAVED_STATE',
        payload: { content: text, fileName: file.name }
      });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
      addToast('success', `Đã mở file: ${file.name}`);
    } catch (err) {
      addToast('error', "Không thể đọc định dạng file này.");
    }
  }, [addToast]);

  const resetDocument = useCallback(() => {
    dispatch({
      type: 'RESET_DOCUMENT',
      payload: { content: "", fileName: "Tai_lieu_moi.md" }
    });
    addToast('info', 'Đã tạo tài liệu trắng.');
  }, [addToast]);

  const handleNewDocument = useCallback(() => {
    if (!state.content.trim()) {
      resetDocument();
      return;
    }
    dispatch({ type: 'SET_SHOW_SAVE_PROMPT', payload: true });
  }, [state.content, resetDocument]);

  const handleSave = useCallback(() => {
    if (!state.content.trim()) {
      addToast('error', "Nội dung trống, không thể lưu.");
      return;
    }
    const blob = new Blob([state.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.fileName.endsWith('.md') ? state.fileName : `${state.fileName}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('success', 'Đã tải xuống file Markdown.');
  }, [state.content, state.fileName, addToast]);

  const handleConfirmSave = useCallback(() => {
    handleSave();
    resetDocument();
  }, [handleSave, resetDocument]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(state.content)
      .then(() => {
        addToast('success', 'Đã sao chép vào bộ nhớ đệm.');
      })
      .catch(() => {
        addToast('error', "Lỗi sao chép.");
      });
  }, [state.content, addToast]);

  const closeHelp = useCallback(() => {
    dispatch({ type: 'SET_SHOW_HELP', payload: false });
  }, []);

  const openHelp = useCallback(() => {
    dispatch({ type: 'SET_SHOW_HELP', payload: true });
  }, []);

  const closeSavePrompt = useCallback(() => {
    dispatch({ type: 'SET_SHOW_SAVE_PROMPT', payload: false });
  }, []);

  return (
    <div className="flex h-screen w-screen bg-neutral-100 overflow-hidden font-sans">
      <Sidebar
        onFileUpload={handleFileUpload}
        onOpenMarkdown={handleOpenMarkdown}
        onNewDocument={handleNewDocument}
        onShowHelp={openHelp}
        isProcessing={state.processingState.isProcessing}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Toolbar
          onSave={handleSave}
          onCopy={handleCopy}
          fileName={state.fileName}
          saveStatus={state.saveStatus}
        />

        <div className="flex-1 overflow-hidden relative bg-neutral-100 p-4">
          <div className="h-full w-full max-w-7xl mx-auto flex gap-4 shadow-sm">
            <div className="flex flex-col bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden w-full" data-color-mode="light">
              <div className="bg-white px-4 py-3 border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex justify-between">
                <span>Soạn thảo Markdown</span>
                <span className="text-neutral-400">{state.content.length} ký tự</span>
              </div>
              <div className="flex-1 overflow-hidden" data-color-mode="light">
                <MDEditor
                  value={state.content}
                  onChange={(val) => handleContentChange(val || '')}
                  preview="edit"
                  height="100%"
                  hideToolbar={false}
                  visibleDragbar={false}
                  className="h-full border-none shadow-none rounded-none"
                />
              </div>
            </div>
          </div>
        </div>

        <Toast toasts={state.toasts} removeToast={removeToast} />

        <ProcessingStatus
          isProcessing={state.processingState.isProcessing}
          stage={state.processingState.stage}
          message={state.processingState.message}
          logs={state.processingState.logs}
        />
      </div>

      {state.showSavePrompt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md border border-neutral-200">
            <div className="flex items-center gap-x-3 text-amber-600 mb-4">
              <AlertTriangle size={28} />
              <h3 className="text-lg font-semibold text-neutral-800">Tạo văn bản mới?</h3>
            </div>
            <p className="text-neutral-600 mb-6 leading-relaxed">
              Bạn có muốn lưu thay đổi hiện tại trước khi tạo tài liệu mới không?
            </p>
            <div className="flex justify-end gap-x-3">
              <button
                onClick={closeSavePrompt}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-md hover:bg-neutral-200"
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

      {state.showHelp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-200">
              <h3 className="text-lg font-semibold text-neutral-800">Hướng dẫn</h3>
              <button onClick={closeHelp} className="text-neutral-500 hover:text-neutral-700">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <p className="mb-4 text-neutral-600">Ứng dụng chuyển đổi PDF sang Markdown sử dụng <strong>DocuMark AI Core Engine</strong>.</p>
              
              <div className="mt-4">
                <h4 className="font-semibold text-neutral-800 mb-2">Cách sử dụng:</h4>
                <ol className="list-decimal pl-5 space-y-2 text-sm text-neutral-600">
                  <li>Click vào nút <strong>Chọn PDF & Chuyển đổi</strong> trên Sidebar.</li>
                  <li>Chọn file PDF, DOCX, hoặc PPTX từ máy tính của bạn.</li>
                  <li>Chờ đợi AI Core xử lý và bóc tách bố cục (Table, Images, Math).</li>
                  <li>Nội dung Markdown sẽ hiển thị ở đây để bạn chỉnh sửa.</li>
                  <li>Click <strong>Lưu file</strong> để tải file `.md` về máy.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {import.meta.env.DEV && <Agentation />}
    </div>
  );
};

export default App;
