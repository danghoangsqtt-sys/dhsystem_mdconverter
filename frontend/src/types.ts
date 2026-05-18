export type ProcessingStage = 
  | 'idle' 
  | 'uploading'     // Đang upload file lên server
  | 'extracting'    // Đang đọc PDF, phân tích layout
  | 'generating'    // Đang nhận diện bảng & trích xuất nội dung
  | 'formatting'    // Đang tạo & định dạng Markdown
  | 'complete';     // Hoàn thành

export interface ProcessingState {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[];
  error: string | null;
  success: boolean;
  uploadProgress: number;  // 0-100, % upload thật từ axios
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