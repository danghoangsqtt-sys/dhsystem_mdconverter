import axios from 'axios';
import { API_BASE_URL, authHeaders, ConversionCancelledError, getBlobErrorMessage, getErrorMessage, wait } from '../../shared/api';

const POLL_INTERVAL_MS = 750;
// Increased timeout for large PDFs (100+ pages with OCR/tables can take 5-10 minutes)
const CONVERSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export type ImageOcrPreset = 'original' | 'balanced' | 'high_contrast';
export type ImageOcrEngine = 'easyocr';
export type OcrExportFormat = 'txt' | 'markdown' | 'docx-editable' | 'docx-faithful';
export type OcrLanguage = 'vi_en' | 'vi' | 'en';

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
  language: OcrLanguage,
  signal?: AbortSignal,
): Promise<ImageOcrJobState> => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  formData.append('preset', preset);
  formData.append('engine', engine);
  formData.append('language', language);
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
    language?: OcrLanguage;
    signal?: AbortSignal;
    onJobStatus?: (job: ImageOcrJobState) => void;
  } = {},
): Promise<ImageOcrResult> => {
  const created = await createImageOcrJob(
    files,
    options.preset ?? 'balanced',
    options.engine ?? 'easyocr',
    options.language ?? 'vi_en',
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
