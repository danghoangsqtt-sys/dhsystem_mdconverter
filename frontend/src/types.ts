export type ProcessingStage = 'idle' | 'uploading' | 'extracting' | 'complete';

export interface ProcessingState {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[];
  error: string | null;
  success: boolean;
}

export interface DocumentData {
  fileName: string;
  content: string;
  lastModified: Date;
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}