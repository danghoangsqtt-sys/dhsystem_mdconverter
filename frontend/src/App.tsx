import React, { useEffect, useCallback, useReducer, useRef, useState, Suspense, lazy } from 'react';
import type { PreviewType } from '@uiw/react-md-editor';
import { Agentation } from 'agentation';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import Toast from './components/Toast';
import ProcessingStatus from './components/ProcessingStatus';
import { ExtractionResultsPanel } from './components/ExtractionResultsPanel';
import { CitationVerificationPanel } from './components/CitationVerificationPanel';
import { TranslationPanel } from './components/TranslationPanel';
import {
  uploadAndConvertFile,
  checkBackendHealth,
  fetchHistory,
  fetchHistoryItem,
  deleteHistoryItem,
  cancelConversionJob,
  verifyCitation,
  translateText,
  ConversionCancelledError,
} from './services/api';
import type { OcrLang, TableMode, HistoryEntry, ConversionJobState, TranslationDirection, TranslationDomain } from './services/api';
import { loadAutosave, saveAutosave } from './services/autosaveDb';
import { extractSourceFileMetadata } from './utils/markdownMetadata';
import type { ProcessingState, ToastMessage, ExtractionResult, CitationVerificationEntry, TranslationEntry, SourceFileMetadata } from './types';
import { AlertTriangle, X } from 'lucide-react';

// Both pull in heavy libraries (CodeMirror, pdf.js) that don't need to block
// the initial render - MDEditor is always shown but can pop in a beat after
// the shell, and PdfViewerBox is only ever mounted once a PDF is loaded.
const MDEditor = lazy(() => import('@uiw/react-md-editor'));
const PdfViewerBox = lazy(() =>
  import('./components/PdfViewerBox').then((mod) => ({ default: mod.PdfViewerBox }))
);

// 'connecting': no successful /api/health response yet (backend process may
// still be starting up, or Electron hasn't spawned it yet in this instant).
// 'unreachable': health checks kept failing after the backend should have
// had time to come up — likely crashed or was never started.
type BackendStatus = 'connecting' | 'starting' | 'loading_models' | 'ready' | 'error' | 'unreachable';

interface BackendState {
  status: BackendStatus;
  detail: string;
}

interface AppState {
  content: string;
  fileName: string;
  toasts: ToastMessage[];
  saveStatus: 'saved' | 'saving';
  showHelp: boolean;
  showSavePrompt: boolean;
  processingState: ProcessingState;
  backend: BackendState;
  history: HistoryEntry[];
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
  | { type: 'LOAD_SAVED_STATE'; payload: { content: string, fileName: string } }
  | { type: 'SET_BACKEND_STATE'; payload: BackendState }
  | { type: 'SET_HISTORY'; payload: HistoryEntry[] }
  | { type: 'REMOVE_HISTORY_ENTRY'; payload: string };

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
    success: false,
    uploadProgress: 0,
    progress: 0,
    jobId: null
  },
  backend: { status: 'connecting', detail: 'Đang kết nối máy chủ...' },
  history: []
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
        fileName: action.payload.fileName,
        // Loading a document (open file, restore autosave) supersedes
        // whatever conversion/processing state was active before it.
        processingState: initialState.processingState
      };
    case 'SET_BACKEND_STATE':
      return { ...state, backend: action.payload };
    case 'SET_HISTORY':
      return { ...state, history: action.payload };
    case 'REMOVE_HISTORY_ENTRY':
      return { ...state, history: state.history.filter(h => h.job_id !== action.payload) };
    default:
      return state;
  }
}

const App: React.FC = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  // Bumped by every action that replaces editor content (new upload, open
  // markdown, new document). An in-flight upload's async response is only
  // applied if this still matches the id it captured when it started —
  // otherwise the user has since navigated elsewhere and the stale result
  // is discarded instead of clobbering whatever they opened in the meantime.
  const activeRequestIdRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const activeUploadControllerRef = useRef<AbortController | null>(null);
  const batchCancelledRef = useRef(false);
  const [previewMode, setPreviewMode] = useState<PreviewType>('edit');
  // The PDF currently shown side-by-side with the editor for region
  // extraction. Only set for .pdf uploads — non-PDF formats have nothing
  // for react-pdf to render — and cleared whenever the document it
  // corresponds to is no longer what's being edited (new doc, open .md).
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  // Regions cropped from sourceFile, OCR'd, and pending user review — search
  // the web or insert into the document. Cleared whenever sourceFile changes,
  // since results reference content from that specific PDF.
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>([]);
  // Citation/content-plausibility checks run against selected passages of the
  // current document. Ephemeral (not persisted to history), same lifecycle as
  // extractionResults — cleared whenever the document itself changes.
  const [citationResults, setCitationResults] = useState<CitationVerificationEntry[]>([]);
  const [isVerifyingCitation, setIsVerifyingCitation] = useState(false);
  // Selection-based translations, same ephemeral lifecycle and hasSelection
  // gating as citationResults above.
  const [translationResults, setTranslationResults] = useState<TranslationEntry[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationDirection, setTranslationDirection] = useState<TranslationDirection>('en_vi');
  const [translationDomain, setTranslationDomain] = useState<TranslationDomain | null>(null);
  // Tracks whether the DOM currently has a non-empty text selection, so the
  // "Xác minh trích dẫn"/"Dịch đoạn đã chọn" buttons can be disabled instead
  // of doing nothing on click. The selected text itself is read fresh at
  // click-time (not stored here) — see handleVerifyCitation/handleTranslate.
  // Selecting inside the MDEditor's raw "edit" textarea doesn't register
  // through the Selection API, so the buttons stay disabled in that mode;
  // only live/preview selections count.
  const [hasSelection, setHasSelection] = useState(false);
  const [ocrLang, setOcrLang] = useState<OcrLang>('vi_en');
  const [tableMode, setTableMode] = useState<TableMode>('accurate');
  const [sourceFileMetadata, setSourceFileMetadata] = useState<SourceFileMetadata | null>(null);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    dispatch({ type: 'ADD_TOAST', payload: { id: Date.now(), type, message } });
  }, []);

  const removeToast = useCallback((id: number) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  // History is a convenience/browsing feature, not part of the critical
  // conversion path — failures are silent rather than surfaced as toasts,
  // since a backend blip here shouldn't interrupt what the user is doing.
  const refreshHistory = useCallback(async () => {
    try {
      const entries = await fetchHistory();
      dispatch({ type: 'SET_HISTORY', payload: entries });
    } catch {
      // ignored — sidebar just keeps showing the last known list
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Poll the backend's real startup/model-loading state instead of assuming
  // it's ready after a fixed delay. Polls quickly until the backend reports
  // 'ready', then backs off to an occasional keep-alive check so a later
  // crash/disconnect is also surfaced instead of failing silently.
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout>;
    let consecutiveFailures = 0;
    let wasReady = false;
    let firstFailureAt: number | null = null;

    // A cold backend start (importing torch/transformers/docling and warming
    // up models) can legitimately take well over a minute on first run —
    // especially with antivirus scanning freshly-installed binaries — so we
    // give startup a long grace period before ever showing 'unreachable'.
    // Once the backend has been ready at least once, a real crash/disconnect
    // should still surface quickly via the short failure-count threshold.
    const INITIAL_STARTUP_GRACE_MS = 120000;
    const POST_READY_FAILURE_LIMIT = 5;

    const poll = async () => {
      let nextDelay: number;
      try {
        const health = await checkBackendHealth();
        consecutiveFailures = 0;
        firstFailureAt = null;
        if (!cancelled) {
          dispatch({ type: 'SET_BACKEND_STATE', payload: { status: health.status, detail: health.detail } });
          if (health.status === 'ready' && !wasReady) {
            addToast('success', 'Máy chủ đã sẵn sàng chuyển đổi tài liệu.');
          }
        }
        wasReady = health.status === 'ready';
        nextDelay = health.status === 'ready' ? 15000 : 1200;
      } catch {
        consecutiveFailures += 1;
        if (firstFailureAt === null) firstFailureAt = Date.now();
        if (!cancelled) {
          const unreachable = wasReady
            ? consecutiveFailures >= POST_READY_FAILURE_LIMIT
            : Date.now() - firstFailureAt >= INITIAL_STARTUP_GRACE_MS;
          if (unreachable && wasReady) {
            addToast('error', 'Mất kết nối với máy chủ backend.');
          }
          dispatch({
            type: 'SET_BACKEND_STATE',
            payload: unreachable
              ? { status: 'unreachable', detail: 'Không thể kết nối máy chủ backend.' }
              : { status: 'connecting', detail: 'Đang kết nối máy chủ...' }
          });
          if (unreachable) wasReady = false;
        }
        nextDelay = 1500;
      }
      if (!cancelled) {
        timerId = setTimeout(poll, nextDelay);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [addToast]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let saved: Awaited<ReturnType<typeof loadAutosave>> = null;
      try {
        saved = await loadAutosave();
      } catch {
        if (!cancelled) addToast('info', 'Không thể đọc bản tự lưu của trình duyệt.');
      }
      if (cancelled) return;

      if (saved !== null) {
        dispatch({
          type: 'LOAD_SAVED_STATE',
          payload: { content: saved.content, fileName: saved.fileName || "Untitled Document" }
        });
      } else {
        const initialText = `# Sẵn sàng chuyển đổi\n\nHãy tải file PDF lên để bắt đầu chuyển đổi sang Markdown bằng Mark Tini Core.\n`;
        dispatch({
          type: 'LOAD_SAVED_STATE',
          payload: { content: initialText, fileName: "Untitled Document" }
        });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [addToast]);

  useEffect(() => {
    const handleSelectionChange = () => {
      setHasSelection(!!window.getSelection()?.toString().trim());
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveAutosave({ content: state.content, fileName: state.fileName })
        .then(() => dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' }))
        .catch(() => {
          addToast('info', 'Không thể lưu bản tự động; hãy tải file Markdown xuống để tránh mất dữ liệu.');
        });
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [state.content, state.fileName, addToast]);

  const handleContentChange = useCallback((newContent: string) => {
    dispatch({ type: 'SET_CONTENT', payload: newContent });
  }, []);

  const syncJobState = useCallback((job: ConversionJobState, requestId: number) => {
    if (activeRequestIdRef.current !== requestId) return;
    activeJobIdRef.current = job.job_id;
    const statusLogs: Record<ConversionJobState['status'], string[]> = {
      queued: ['✓ Đã tải file lên an toàn.', 'Tác vụ đang chờ trong hàng đợi backend.'],
      converting: ['✓ Đã tải file lên an toàn.', '✓ Đã nhận tác vụ từ hàng đợi.', 'Docling đang phân tích tài liệu.'],
      finalizing: ['✓ Docling đã phân tích xong.', 'Đang kiểm tra và hoàn thiện Markdown.'],
      complete: ['✓ Chuyển đổi và lưu kết quả hoàn tất.'],
      cancelling: ['Đã nhận yêu cầu hủy; kết quả đang chạy sẽ bị loại bỏ.'],
      cancelled: ['Tác vụ đã được hủy an toàn.'],
      error: [job.error || 'Tác vụ backend thất bại.'],
    };
    dispatch({
      type: 'SET_PROCESSING_STATE',
      payload: {
        isProcessing: !['complete', 'cancelled', 'error'].includes(job.status),
        stage: job.status,
        message: job.message,
        logs: statusLogs[job.status],
        progress: job.progress,
        jobId: job.job_id,
      },
    });
  }, []);

  const handleFileUpload = useCallback(async (file: File): Promise<boolean> => {
    const requestId = ++activeRequestIdRef.current;
    const uploadController = new AbortController();
    activeUploadControllerRef.current = uploadController;
    activeJobIdRef.current = null;

    // Shown immediately (not gated on conversion finishing) so the user can
    // start browsing pages / drawing extraction boxes right away. Only PDFs
    // get the side-by-side viewer — react-pdf can't render DOCX/PPTX/HTML.
    setSourceFile(file.name.toLowerCase().endsWith('.pdf') ? file : null);
    setExtractionResults([]);
    setCitationResults([]);
    setTranslationResults([]);

    dispatch({
      type: 'SET_PROCESSING_STATE',
      payload: {
        isProcessing: true,
        stage: 'uploading',
        message: 'Đang tải file lên backend...',
        logs: ['Đang kiểm tra định dạng và kích thước file.'],
        error: null,
        success: false,
        uploadProgress: 0,
        progress: 0,
        jobId: null,
      }
    });

    const newFileName = file.name.replace(/\.[^/.]+$/, ".md");
    dispatch({ type: 'SET_FILE_NAME', payload: newFileName });

    try {
      const response = await uploadAndConvertFile(file, {
        lang: ocrLang,
        tableMode,
        signal: uploadController.signal,
        onUploadProgress: (progress) => {
          if (activeRequestIdRef.current !== requestId) return;
          dispatch({
            type: 'SET_PROCESSING_STATE',
            payload: {
              uploadProgress: progress,
              message: `Đang tải file lên server... ${progress}%`
            }
          });
        },
        onJobCreated: job => syncJobState(job, requestId),
        onJobStatus: job => syncJobState(job, requestId),
      });

      if (activeRequestIdRef.current !== requestId) {
        // Superseded by a newer upload / opened file / new document while
        // this request was in flight — discard the stale result.
        return false;
      }

      activeJobIdRef.current = null;
      activeUploadControllerRef.current = null;
      const metadata = extractSourceFileMetadata(response.markdown);
      setSourceFileMetadata(metadata);
      dispatch({ type: 'SET_CONTENT', payload: response.markdown });
      dispatch({
        type: 'SET_PROCESSING_STATE',
        payload: {
          isProcessing: false,
          stage: 'complete',
          success: true,
          message: 'Chuyển đổi hoàn tất!',
          progress: 100,
          jobId: response.job_id,
          logs: ['✓ Chuyển đổi thành công và đã kiểm tra định dạng Markdown.']
        }
      });

      addToast('success', 'Chuyển đổi văn bản thành công!');
      refreshHistory();
      return true;
    } catch (err: unknown) {
      if (activeRequestIdRef.current !== requestId) {
        return false;
      }

      activeJobIdRef.current = null;
      activeUploadControllerRef.current = null;
      const wasCancelled = err instanceof ConversionCancelledError || uploadController.signal.aborted;
      let errorMessage = 'Có lỗi xảy ra khi xử lý tài liệu.';
      if (err instanceof Error && err.message) errorMessage = err.message;

      dispatch({
        type: 'SET_PROCESSING_STATE',
        payload: {
          isProcessing: false,
          stage: wasCancelled ? 'cancelled' : 'error',
          message: wasCancelled ? 'Tác vụ đã bị hủy.' : errorMessage,
          logs: wasCancelled ? ['Tác vụ đã được hủy an toàn.'] : [errorMessage],
          error: wasCancelled ? null : errorMessage,
          success: false,
        }
      });
      if (wasCancelled) addToast('info', 'Đã hủy tác vụ chuyển đổi.');
      else {
        addToast('error', errorMessage);
        console.error(err);
      }
      return false;
    }
  }, [addToast, ocrLang, tableMode, refreshHistory, syncJobState]);

  const handleCancelProcessing = useCallback(async () => {
    batchCancelledRef.current = true;
    activeUploadControllerRef.current?.abort();
    const jobId = activeJobIdRef.current;
    if (!jobId) return;
    try {
      const job = await cancelConversionJob(jobId);
      syncJobState(job, activeRequestIdRef.current);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể gửi yêu cầu hủy tác vụ.';
      addToast('error', message);
    }
  }, [addToast, syncJobState]);

  // Processes multiple files sequentially (not in parallel) so they don't
  // contend for the backend's single conversion pipeline and so upload
  // progress / processing status stays meaningful for one file at a time.
  // Each result lands in History regardless; the editor ends up showing
  // whichever file finished last, matching single-file upload behavior.
  const handleFilesUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    batchCancelledRef.current = false;
    if (files.length === 1) {
      await handleFileUpload(files[0]);
      return;
    }

    addToast('info', `Đang xử lý hàng loạt ${files.length} file...`);
    let successCount = 0;
    for (const file of files) {
      if (batchCancelledRef.current) break;
      const ok = await handleFileUpload(file);
      if (ok) successCount++;
    }
    addToast(
      successCount === files.length ? 'success' : 'info',
      `${batchCancelledRef.current ? 'Đã dừng' : 'Hoàn tất'} hàng loạt: ${successCount}/${files.length} file thành công. Xem lại trong Lịch sử.`
    );
  }, [handleFileUpload, addToast]);

  // Sends region images cropped out of the PDF viewer through the same
  // /api/convert pipeline used for whole documents (docling's ImageFormatOption
  // uses identical OCR/language config), with record_history=false since these
  // one-off crops aren't "documents" worth keeping in the history list. Each
  // region's OCR'd text becomes its own review card (see ExtractionResultsPanel)
  // instead of being auto-appended — the point is to let the user search the
  // web for that region's content during research, then optionally insert it.
  // Rethrows on failure so PdfViewerBox knows to keep the boxes for retry.
  const handleExtractRegions = useCallback(async (images: Blob[]) => {
    if (images.length === 0) return;
    try {
      const results = [];
      for (let i = 0; i < images.length; i += 1) {
        results.push(await uploadAndConvertFile(
          new File([images[i]], `vung-chon-${Date.now()}-${i}.png`, { type: 'image/png' }),
          { lang: ocrLang, tableMode, recordHistory: false }
        ));
      }
      const newResults: ExtractionResult[] = results
        .map((r, i) => ({ id: `${Date.now()}-${i}`, text: r.markdown.trim() }))
        .filter(r => r.text.length > 0);

      if (newResults.length === 0) {
        addToast('info', 'Không nhận diện được nội dung trong vùng đã chọn.');
        return;
      }
      setExtractionResults(prev => [...prev, ...newResults]);
      addToast('success', `Đã nhận diện ${newResults.length} vùng. Tìm kiếm hoặc chèn vào tài liệu bên dưới.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi khi trích xuất vùng đã chọn.';
      addToast('error', message);
      throw err;
    }
  }, [ocrLang, tableMode, addToast]);

  const handleExtractionTextChange = useCallback((id: string, text: string) => {
    setExtractionResults(prev => prev.map(r => (r.id === id ? { ...r, text } : r)));
  }, []);

  const handleExtractionDismiss = useCallback((id: string) => {
    setExtractionResults(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleExtractionInsert = useCallback((result: ExtractionResult) => {
    dispatch({
      type: 'SET_CONTENT',
      payload: state.content.trim() ? `${state.content}\n\n${result.text}` : result.text
    });
    setExtractionResults(prev => prev.filter(r => r.id !== result.id));
    addToast('success', 'Đã chèn vào tài liệu.');
  }, [state.content, addToast]);

  // Opens a web search for the (possibly user-edited) region text. Uses the
  // Electron main-process bridge when available (renderer has no direct
  // shell access under contextIsolation) and falls back to window.open for
  // plain-browser dev mode.
  const handleExtractionSearch = useCallback((result: ExtractionResult) => {
    const query = result.text.trim();
    if (!query) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    if (window.documark?.openExternal) {
      window.documark.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // Reads the current DOM selection at click-time (not live-tracked — only
  // whether *something* is selected is tracked, via hasSelection) and sends
  // it to OpenAlex/Ollama for a citation-existence + advisory plausibility
  // check. Requires internet access — the only action in the app that does,
  // so failures get an explicit message rather than the generic fallback.
  const handleVerifyCitation = useCallback(async () => {
    const selectedText = window.getSelection()?.toString().trim() ?? '';
    if (!selectedText) {
      addToast('info', 'Hãy bôi đen một đoạn trong bản xem trước để xác minh.');
      return;
    }
    setIsVerifyingCitation(true);
    try {
      const result = await verifyCitation(selectedText);
      setCitationResults(prev => [...prev, { id: `${Date.now()}`, ...result }]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể kết nối để xác minh trích dẫn.';
      addToast('error', message);
    } finally {
      setIsVerifyingCitation(false);
    }
  }, [addToast]);

  const handleCitationDismiss = useCallback((id: string) => {
    setCitationResults(prev => prev.filter(r => r.id !== id));
  }, []);

  // Same selection-read pattern as handleVerifyCitation, but runs entirely
  // offline against a locally-cached NMT model — no internet required.
  const handleTranslate = useCallback(async () => {
    const selectedText = window.getSelection()?.toString().trim() ?? '';
    if (!selectedText) {
      addToast('info', 'Hãy bôi đen một đoạn trong bản xem trước để dịch.');
      return;
    }
    setIsTranslating(true);
    try {
      const result = await translateText(selectedText, translationDirection, translationDomain);
      setTranslationResults(prev => [...prev, { id: `${Date.now()}`, ...result }]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể dịch nội dung đã chọn.';
      addToast('error', message);
    } finally {
      setIsTranslating(false);
    }
  }, [addToast, translationDirection, translationDomain]);

  const handleTranslationDismiss = useCallback((id: string) => {
    setTranslationResults(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleLoadHistoryItem = useCallback(async (jobId: string) => {
    activeRequestIdRef.current++;
    activeUploadControllerRef.current?.abort();
    if (activeJobIdRef.current) void cancelConversionJob(activeJobIdRef.current).catch(() => undefined);
    activeJobIdRef.current = null;
    setSourceFile(null);
    setExtractionResults([]);
    setCitationResults([]);
    setTranslationResults([]);

    try {
      const entry = await fetchHistoryItem(jobId);
      const metadata = extractSourceFileMetadata(entry.markdown);
      setSourceFileMetadata(metadata);
      dispatch({
        type: 'LOAD_SAVED_STATE',
        payload: {
          content: entry.markdown,
          fileName: entry.original_filename.replace(/\.[^/.]+$/, '.md')
        }
      });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
      addToast('success', `Đã tải lại: ${entry.original_filename}`);
    } catch {
      addToast('error', 'Không thể tải lại tài liệu từ lịch sử.');
    }
  }, [addToast]);

  const handleDeleteHistoryItem = useCallback(async (jobId: string) => {
    try {
      await deleteHistoryItem(jobId);
      dispatch({ type: 'REMOVE_HISTORY_ENTRY', payload: jobId });
    } catch {
      addToast('error', 'Không thể xóa mục lịch sử.');
    }
  }, [addToast]);

  const handleOpenMarkdown = useCallback(async (file: File) => {
    // Invalidate any in-flight conversion so its eventual response can't
    // clobber the file we're about to load.
    activeRequestIdRef.current++;
    activeUploadControllerRef.current?.abort();
    if (activeJobIdRef.current) void cancelConversionJob(activeJobIdRef.current).catch(() => undefined);
    activeJobIdRef.current = null;
    setSourceFile(null);
    setExtractionResults([]);
    setCitationResults([]);
    setTranslationResults([]);

    try {
      const text = await file.text();
      const metadata = extractSourceFileMetadata(text);
      setSourceFileMetadata(metadata);
      dispatch({
        type: 'LOAD_SAVED_STATE',
        payload: { content: text, fileName: file.name }
      });
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
      addToast('success', `Đã mở file: ${file.name}`);
    } catch {
      addToast('error', "Không thể đọc định dạng file này.");
    }
  }, [addToast]);

  const handleOpenOriginal = useCallback(() => {
    // Trigger the markdown file input to let user re-upload the original PDF
    // Since the original PDF was deleted after conversion, user needs to select it again
    const mdInput = document.querySelector('input[type="file"][accept=".md,.markdown,.txt"]') as HTMLInputElement;
    if (mdInput) {
      mdInput.click();
    }
  }, []);

  const resetDocument = useCallback(() => {
    // Invalidate any in-flight conversion so its eventual response can't
    // clobber the blank document we're about to show.
    activeRequestIdRef.current++;
    activeUploadControllerRef.current?.abort();
    if (activeJobIdRef.current) void cancelConversionJob(activeJobIdRef.current).catch(() => undefined);
    activeJobIdRef.current = null;
    setSourceFile(null);
    setSourceFileMetadata(null);
    setExtractionResults([]);
    setCitationResults([]);
    setTranslationResults([]);

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
        onFilesUpload={handleFilesUpload}
        onOpenMarkdown={handleOpenMarkdown}
        onNewDocument={handleNewDocument}
        onShowHelp={openHelp}
        isProcessing={state.processingState.isProcessing}
        backendStatus={state.backend.status}
        backendDetail={state.backend.detail}
        ocrLang={ocrLang}
        onOcrLangChange={setOcrLang}
        tableMode={tableMode}
        onTableModeChange={setTableMode}
        history={state.history}
        onLoadHistoryItem={handleLoadHistoryItem}
        onDeleteHistoryItem={handleDeleteHistoryItem}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Toolbar
          onSave={handleSave}
          onCopy={handleCopy}
          onVerifyCitation={handleVerifyCitation}
          canVerifyCitation={hasSelection}
          isVerifyingCitation={isVerifyingCitation}
          onTranslate={handleTranslate}
          canTranslate={hasSelection}
          isTranslating={isTranslating}
          translationDirection={translationDirection}
          onTranslationDirectionChange={setTranslationDirection}
          translationDomain={translationDomain}
          onTranslationDomainChange={setTranslationDomain}
          fileName={state.fileName}
          saveStatus={state.saveStatus}
          previewMode={previewMode}
          onPreviewModeChange={setPreviewMode}
          sourceFileMetadata={sourceFileMetadata}
          onOpenOriginal={handleOpenOriginal}
        />

        <div className="flex-1 overflow-hidden relative bg-neutral-100 p-4">
          <div className={`h-full mx-auto flex gap-4 shadow-sm ${sourceFile ? 'w-full' : 'w-full max-w-7xl'}`}>
            {sourceFile && (
              <div className="w-1/2 h-full flex flex-col gap-3">
                <div className="flex-1 min-h-0">
                  <Suspense fallback={<div className="h-full flex items-center justify-center border border-gray-200 bg-gray-50 text-gray-400 text-sm rounded-lg animate-pulse">Đang tải trình xem PDF...</div>}>
                    <PdfViewerBox file={sourceFile} onExtractRegions={handleExtractRegions} />
                  </Suspense>
                </div>
                <ExtractionResultsPanel
                  results={extractionResults}
                  onTextChange={handleExtractionTextChange}
                  onSearch={handleExtractionSearch}
                  onInsert={handleExtractionInsert}
                  onDismiss={handleExtractionDismiss}
                />
              </div>
            )}
            <div className="flex flex-col bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden w-full" data-color-mode="light">
              <div className="bg-white px-4 py-3 border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex justify-between">
                <span>Soạn thảo Markdown</span>
                <span className="text-neutral-400">{state.content.length} ký tự</span>
              </div>
              <div className="flex-1 overflow-hidden" data-color-mode="light">
                <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-400 text-sm animate-pulse">Đang tải trình soạn thảo...</div>}>
                  <MDEditor
                    value={state.content}
                    onChange={(val) => handleContentChange(val || '')}
                    preview={previewMode}
                    height="100%"
                    hideToolbar={false}
                    visibleDragbar={false}
                    className="h-full border-none shadow-none rounded-none"
                  />
                </Suspense>
              </div>
              <CitationVerificationPanel results={citationResults} onDismiss={handleCitationDismiss} />
              <TranslationPanel results={translationResults} onDismiss={handleTranslationDismiss} />
            </div>
          </div>
        </div>

        <Toast toasts={state.toasts} removeToast={removeToast} />

        <ProcessingStatus
          isProcessing={state.processingState.isProcessing}
          stage={state.processingState.stage}
          message={state.processingState.message}
          logs={state.processingState.logs}
          uploadProgress={state.processingState.uploadProgress}
          progress={state.processingState.progress}
          onCancel={handleCancelProcessing}
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
              <p className="mb-4 text-neutral-600">Ứng dụng chuyển đổi PDF sang Markdown sử dụng <strong>Mark Tini Core Engine</strong>.</p>
              
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
