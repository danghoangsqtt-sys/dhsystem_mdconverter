import axios from 'axios';
import type { CitationVerificationResult, TranslationResult } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8088/api';
const API_TOKEN_HEADER = 'X-DocuMark-Token';
const POLL_INTERVAL_MS = 750;

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
      timeout: 120000,
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
    timeout: 10000,
  });
  return response.data;
};

export const fetchConversionResult = async (jobId: string): Promise<ConversionResponse> => {
  const response = await axios.get<ConversionResponse>(`${API_BASE_URL}/jobs/${jobId}/result`, {
    headers: await authHeaders(),
    timeout: 10000,
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

// Runs entirely offline once the local NMT model is loaded — no internet
// required, unlike verifyCitation above. Generous timeout since the first
// call in a session also has to load the ~1GB model before it can translate.
export const translateText = async (text: string): Promise<TranslationResult> => {
  try {
    const response = await axios.post<TranslationResult>(
      `${API_BASE_URL}/translate`,
      { text },
      { headers: await authHeaders(), timeout: 60000 },
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Không thể dịch nội dung đã chọn.'), { cause: error });
  }
};
