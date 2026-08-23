import axios from 'axios';
import type { CitationVerificationResult, TranslationResult } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8088/api';
const API_TOKEN_HEADER = 'X-DocuMark-Token';
const POLL_INTERVAL_MS = 750;
// Increased timeout for large PDFs (100+ pages with OCR/tables can take 5-10 minutes)
const CONVERSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const PDF_TO_WORD_TIMEOUT_MS = 15 * 60 * 1000;

let browserTokenPromise: Promise<string> | null = null;

const getApiToken = async (): Promise<string> => {
  const electronToken = window.documark?.apiToken;
  if (electronToken) return electronToken;

  if (!browserTokenPromise) {
    browserTokenPromise = axios
      .get<{ token: string }>(`${API_BASE_URL}/session`, { timeout: 5000 })
      .then(response => response.data.token)
      .catch(error => {
        browserTokenPromise = null;
        throw error;
      });
  }
  return browserTokenPromise;
};

const authHeaders = async (): Promise<Record<string, string>> => ({
  [API_TOKEN_HEADER]: await getApiToken(),
});

export interface ConversionResponse {
  success: boolean;
  job_id: string;
  original_filename: string;
  markdown: string;
}

export interface UploadProgressCallback {
  (progress: number): void;
}

export type BackendStartupStatus = 'starting' | 'loading_models' | 'ready' | 'error';

export interface BackendHealth {
  status: BackendStartupStatus;
  detail: string;
}

export type OcrLang = 'vi_en' | 'vi' | 'en';
export type TableMode = 'accurate' | 'fast';

export const OCR_LANG_OPTIONS: { value: OcrLang; label: string }[] = [
  { value: 'vi_en', label: 'Tiếng Việt + English' },
  { value: 'vi', label: 'Chỉ Tiếng Việt' },
  { value: 'en', label: 'Chỉ English' },
];

export const TABLE_MODE_OPTIONS: { value: TableMode; label: string }[] = [
  { value: 'accurate', label: 'Chính xác (chậm hơn)' },
  { value: 'fast', label: 'Nhanh' },
];

export interface HistoryEntry {
  job_id: string;
  original_filename: string;
  created_at: string;
  lang: string;
  table_mode: string;
}

export interface HistoryEntryDetail extends HistoryEntry {
  markdown: string;
}

export type ConversionJobStatus =
  | 'queued'
  | 'converting'
  | 'finalizing'
  | 'complete'
  | 'cancelling'
  | 'cancelled'
  | 'error';

export interface ConversionJobState {
  job_id: string;
  original_filename: string;
  status: ConversionJobStatus;
  progress: number;
  message: string;
  created_at: string;
  updated_at: string;
  error: string | null;
}

export class ConversionCancelledError extends Error {
  constructor() {
    super('Tác vụ chuyển đổi đã bị hủy.');
    this.name = 'ConversionCancelledError';
  }
}

export const checkBackendHealth = async (): Promise<BackendHealth> => {
  const response = await axios.get<BackendHealth>(`${API_BASE_URL}/health`, {
    headers: await authHeaders(),
    timeout: 4000,
  });
  return response.data;
};

export interface UploadOptions {
  lang?: OcrLang;
  tableMode?: TableMode;
  recordHistory?: boolean;
  onUploadProgress?: UploadProgressCallback;
  onJobCreated?: (job: ConversionJobState) => void;
  onJobStatus?: (job: ConversionJobState) => void;
  signal?: AbortSignal;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error) && error.response) {
    const detail = error.response.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
  }
  return fallback;
};

const getBlobErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
  if (!axios.isAxiosError(error) || !error.response) return fallback;
  const data = error.response.data;
  if (!(data instanceof Blob)) return getErrorMessage(error, fallback);
  try {
    const parsed = JSON.parse(await data.text());
    return typeof parsed?.detail === 'string' ? parsed.detail : fallback;
  } catch {
    return fallback;
  }
};

export const createConversionJob = async (
  file: File,
  options: UploadOptions = {},
): Promise<ConversionJobState> => {
  const { lang = 'vi_en', tableMode = 'accurate', recordHistory = true, onUploadProgress, signal } = options;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('lang', lang);
  formData.append('table_mode', tableMode);
  formData.append('record_history', String(recordHistory));

  try {
    const response = await axios.post<ConversionJobState>(`${API_BASE_URL}/jobs`, formData, {
      headers: {
        ...(await authHeaders()),
        'Content-Type': 'multipart/form-data',
      },
      timeout: CONVERSION_TIMEOUT_MS,
      signal,
      onUploadProgress: event => {
        if (onUploadProgress && event.total) {
          onUploadProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Không thể tạo tác vụ chuyển đổi.'), { cause: error });
  }
};

export const fetchConversionJob = async (jobId: string): Promise<ConversionJobState> => {
  const response = await axios.get<ConversionJobState>(`${API_BASE_URL}/jobs/${jobId}`, {
    headers: await authHeaders(),
    timeout: 30000, // Increased for long-running conversions
  });
  return response.data;
};

export const fetchConversionResult = async (jobId: string): Promise<ConversionResponse> => {
  const response = await axios.get<ConversionResponse>(`${API_BASE_URL}/jobs/${jobId}/result`, {
    headers: await authHeaders(),
    timeout: 30000, // Increased for large results
  });
  return response.data;
};

export const cancelConversionJob = async (jobId: string): Promise<ConversionJobState> => {
  const response = await axios.delete<ConversionJobState>(`${API_BASE_URL}/jobs/${jobId}`, {
    headers: await authHeaders(),
    timeout: 10000,
  });
  return response.data;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, milliseconds));

export const uploadAndConvertFile = async (
  file: File,
  options: UploadOptions = {},
): Promise<ConversionResponse> => {
  const created = await createConversionJob(file, options);
  options.onJobCreated?.(created);
  options.onJobStatus?.(created);

  let consecutivePollFailures = 0;
  while (true) {
    await wait(POLL_INTERVAL_MS);
    let job: ConversionJobState;
    try {
      job = await fetchConversionJob(created.job_id);
      consecutivePollFailures = 0;
    } catch (error) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 5) {
        throw new Error('Mất kết nối khi đang theo dõi tác vụ. Backend có thể vẫn đang xử lý.', {
          cause: error,
        });
      }
      continue;
    }

    options.onJobStatus?.(job);
    if (job.status === 'complete') return fetchConversionResult(job.job_id);
    if (job.status === 'cancelled') throw new ConversionCancelledError();
    if (job.status === 'error') throw new Error(job.error || 'Chuyển đổi thất bại.');
  }
};

export const fetchHistory = async (): Promise<HistoryEntry[]> => {
  const response = await axios.get<HistoryEntry[]>(`${API_BASE_URL}/history`, {
    headers: await authHeaders(),
    timeout: 10000,
  });
  return response.data;
};

export const fetchHistoryItem = async (jobId: string): Promise<HistoryEntryDetail> => {
  const response = await axios.get<HistoryEntryDetail>(`${API_BASE_URL}/history/${jobId}`, {
    headers: await authHeaders(),
    timeout: 10000,
  });
  return response.data;
};

export const fetchHistoryOriginal = async (jobId: string): Promise<Blob> => {
  try {
    const response = await axios.get<Blob>(`${API_BASE_URL}/history/${jobId}/original`, {
      headers: await authHeaders(),
      responseType: 'blob',
      timeout: 60000,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, 'Không thể khôi phục tài liệu gốc.'),
      { cause: error },
    );
  }
};

export const exportMarkdownToWord = async (
  markdown: string,
  originalFilename: string,
): Promise<Blob> => {
  const formData = new FormData();
  formData.append('markdown', markdown);
  formData.append('original_filename', originalFilename);
  try {
    const response = await axios.post<Blob>(`${API_BASE_URL}/export/markdown-to-word`, formData, {
      headers: {
        ...(await authHeaders()),
        'Content-Type': 'multipart/form-data',
      },
      responseType: 'blob',
      timeout: 120_000,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      await getBlobErrorMessage(error, 'Không thể tạo DOCX chỉnh sửa được từ nội dung Docling.'),
      { cause: error },
    );
  }
};

export const exportPdfToFaithfulWord = async (
  file: File,
  onUploadProgress?: UploadProgressCallback,
): Promise<Blob> => {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const response = await axios.post<Blob>(`${API_BASE_URL}/export/pdf-to-word-faithful`, formData, {
      headers: {
        ...(await authHeaders()),
        'Content-Type': 'multipart/form-data',
      },
      responseType: 'blob',
      timeout: PDF_TO_WORD_TIMEOUT_MS,
      onUploadProgress: event => {
        if (onUploadProgress && event.total) {
          onUploadProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    });
    return response.data;
  } catch (error) {
    throw new Error(
      await getBlobErrorMessage(error, 'Không thể tạo file Word giữ nguyên bố cục PDF.'),
      { cause: error },
    );
  }
};

export type ImageOcrPreset = 'original' | 'balanced' | 'high_contrast';
export type ImageOcrEngine = 'easyocr';
export type OcrExportFormat = 'txt' | 'markdown' | 'docx-editable' | 'docx-faithful';

export interface ImageOcrLine {
  text: string;
  confidence: number;
  box: number[][];
}

export interface ImageOcrPage {
  index: number;
  filename: string;
  width: number;
  height: number;
  engine: ImageOcrEngine;
  recipe: string[];
  confidence: number;
  lines: ImageOcrLine[];
  text: string;
  error: string | null;
}

export interface ImageOcrJobState {
  job_id: string;
  status: 'queued' | 'recognizing' | 'cancelling' | 'cancelled' | 'complete' | 'error';
  progress: number;
  message: string;
  page_count: number;
  completed_pages: number;
  created_at: string;
  updated_at: string;
  error: string | null;
}

export interface ImageOcrResult {
  job_id: string;
  engine: ImageOcrEngine;
  preset: ImageOcrPreset;
  pages: ImageOcrPage[];
}

export const createImageOcrJob = async (
  files: File[],
  preset: ImageOcrPreset,
  engine: ImageOcrEngine,
  signal?: AbortSignal,
): Promise<ImageOcrJobState> => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  formData.append('preset', preset);
  formData.append('engine', engine);
  try {
    const response = await axios.post<ImageOcrJobState>(`${API_BASE_URL}/ocr/jobs`, formData, {
      headers: { ...(await authHeaders()), 'Content-Type': 'multipart/form-data' },
      timeout: CONVERSION_TIMEOUT_MS,
      signal,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Không thể tạo tác vụ OCR.'), { cause: error });
  }
};

export const fetchImageOcrJob = async (jobId: string): Promise<ImageOcrJobState> => {
  const response = await axios.get<ImageOcrJobState>(`${API_BASE_URL}/ocr/jobs/${jobId}`, {
    headers: await authHeaders(),
    timeout: 30_000,
  });
  return response.data;
};

export const fetchImageOcrResult = async (jobId: string): Promise<ImageOcrResult> => {
  const response = await axios.get<ImageOcrResult>(`${API_BASE_URL}/ocr/jobs/${jobId}/result`, {
    headers: await authHeaders(),
    timeout: 30_000,
  });
  return response.data;
};

export const cancelImageOcrJob = async (jobId: string): Promise<ImageOcrJobState> => {
  const response = await axios.delete<ImageOcrJobState>(`${API_BASE_URL}/ocr/jobs/${jobId}`, {
    headers: await authHeaders(),
    timeout: 10_000,
  });
  return response.data;
};

export const recognizeImages = async (
  files: File[],
  options: {
    preset?: ImageOcrPreset;
    engine?: ImageOcrEngine;
    signal?: AbortSignal;
    onJobStatus?: (job: ImageOcrJobState) => void;
  } = {},
): Promise<ImageOcrResult> => {
  const created = await createImageOcrJob(
    files,
    options.preset ?? 'balanced',
    options.engine ?? 'easyocr',
    options.signal,
  );
  options.onJobStatus?.(created);
  const cancelOnAbort = () => { void cancelImageOcrJob(created.job_id); };
  options.signal?.addEventListener('abort', cancelOnAbort, { once: true });
  try {
    while (true) {
      if (options.signal?.aborted) throw new ConversionCancelledError();
      await wait(POLL_INTERVAL_MS);
      const job = await fetchImageOcrJob(created.job_id);
      options.onJobStatus?.(job);
      if (job.status === 'complete') return await fetchImageOcrResult(job.job_id);
      if (job.status === 'cancelled') throw new ConversionCancelledError();
      if (job.status === 'error') throw new Error(job.error || 'Nhận dạng ảnh thất bại.');
    }
  } finally {
    options.signal?.removeEventListener('abort', cancelOnAbort);
  }
};

export const exportImageOcr = async (
  files: File[],
  pages: Pick<ImageOcrPage, 'filename' | 'text'>[],
  exportFormat: OcrExportFormat,
): Promise<Blob> => {
  const formData = new FormData();
  formData.append('reviewed_pages', JSON.stringify(pages));
  formData.append('export_format', exportFormat);
  files.forEach(file => formData.append('files', file));
  try {
    const response = await axios.post<Blob>(`${API_BASE_URL}/ocr/export`, formData, {
      headers: { ...(await authHeaders()), 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
      timeout: CONVERSION_TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    throw new Error(await getBlobErrorMessage(error, 'Không thể xuất kết quả OCR.'), { cause: error });
  }
};

export const deleteHistoryItem = async (jobId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/history/${jobId}`, {
    headers: await authHeaders(),
    timeout: 10000,
  });
};

// Requires internet access — the only call in this file that does. The
// backend checks OpenAlex (~10s budget) then, only if a local Ollama model is
// configured, asks it for an advisory read (~30s budget); 45s covers both
// running back-to-back with margin.
export const verifyCitation = async (text: string): Promise<CitationVerificationResult> => {
  try {
    const response = await axios.post<CitationVerificationResult>(
      `${API_BASE_URL}/verify-citation`,
      { text },
      { headers: await authHeaders(), timeout: 45000 },
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Không thể kết nối để xác minh trích dẫn.'), { cause: error });
  }
};

export type TranslationDirection = 'en_vi' | 'vi_en';
export type TranslationDomain = 'cs_ai' | 'stem' | 'econ_social';

export const TRANSLATION_DIRECTION_OPTIONS: { value: TranslationDirection; label: string }[] = [
  { value: 'en_vi', label: 'Anh → Việt' },
  { value: 'vi_en', label: 'Việt → Anh' },
];

// value: null means "no domain glossary" — always available, matches the
// backend's Optional[str] domain field. Mirrors DOMAIN_LABELS in
// backend/src/services/translation_glossaries.py; keep both in sync.
export const TRANSLATION_DOMAIN_OPTIONS: { value: TranslationDomain | null; label: string }[] = [
  { value: null, label: 'Chung (không chọn lĩnh vực)' },
  { value: 'cs_ai', label: 'Khoa học máy tính / AI-ML' },
  { value: 'stem', label: 'Toán - Lý - Hóa' },
  { value: 'econ_social', label: 'Kinh tế / Khoa học xã hội' },
];

// Runs entirely offline once the local NMT model is loaded — no internet
// required, unlike verifyCitation above. Generous timeout since the first
// call in a session also has to load the ~1GB model before it can translate.
// `domain`, if given, forces domain-specific terminology in the output
// instead of the model's generic (and sometimes inconsistent) rendering.
export const translateText = async (
  text: string,
  direction: TranslationDirection = 'en_vi',
  domain: TranslationDomain | null = null,
): Promise<TranslationResult> => {
  try {
    const response = await axios.post<TranslationResult>(
      `${API_BASE_URL}/translate`,
      { text, direction, domain },
      { headers: await authHeaders(), timeout: 60000 },
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Không thể dịch nội dung đã chọn.'), { cause: error });
  }
};
