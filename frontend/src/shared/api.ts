import axios from 'axios';

export const API_BASE_URL = 'http://127.0.0.1:8088/api';
const API_TOKEN_HEADER = 'X-DocuMark-Token';

let browserTokenPromise: Promise<string> | null = null;

export const getApiToken = async (): Promise<string> => {
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

export const authHeaders = async (): Promise<Record<string, string>> => ({
  [API_TOKEN_HEADER]: await getApiToken(),
});

export type BackendStartupStatus = 'starting' | 'loading_models' | 'ready' | 'error';

export interface BackendHealth {
  status: BackendStartupStatus;
  detail: string;
}

export const checkBackendHealth = async (): Promise<BackendHealth> => {
  const response = await axios.get<BackendHealth>(`${API_BASE_URL}/health`, {
    headers: await authHeaders(),
    timeout: 4000,
  });
  return response.data;
};

export class ConversionCancelledError extends Error {
  constructor() {
    super('Tác vụ chuyển đổi đã bị hủy.');
    this.name = 'ConversionCancelledError';
  }
}

export const wait = (milliseconds: number): Promise<void> =>
  new Promise(resolve => window.setTimeout(resolve, milliseconds));

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error) && error.response) {
    const detail = error.response.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
  }
  return fallback;
};

export const getBlobErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
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
