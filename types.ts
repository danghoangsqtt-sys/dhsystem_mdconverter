export type ProcessingStage = 'idle' | 'extracting' | 'uploading' | 'generating' | 'formatting' | 'complete';

export interface ProcessingState {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[]; // Danh sách các thông báo chi tiết
  error: string | null;
  success: boolean;
}

export type AIProvider = 'ollama' | 'gemini';

export interface AppSettings {
  provider: AIProvider;
  ollamaModel: string; // e.g., 'llama3', 'mistral', 'openhermes'
  ollamaUrl: string;   // e.g., 'http://localhost:11434'
  geminiApiKey: string;
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

export const TEMPLATE_INSTRUCTION = `
GHI CHÚ SOẠN THẢO (DÀNH CHO NGƯỜI VIẾT)
# Tiêu đề lớn (tên văn bản)
## Chương và các mục ngang cấp với chương
### Tiểu mục cấp 1
#### Tiểu mục cấp 2
##### Tiểu mục cấp 3
1. 2. 3. Danh sách có đánh số
- Danh sách không đánh số
**text** Nội dung bắt buộc / nhấn mạnh
> Ghi chú
ĐIỀU LỆNH QUẢN LÝ BỘ ĐỘI
Tài liệu soạn thảo theo chuẩn Markdown
Dùng cho tra cứu điều lệnh – điều lệ – quy định nội bộ
METADATA VĂN BẢN
Tên văn bản: [Tên văn bản từ PDF]
Cơ quan ban hành: [Cơ quan]
Số / ký hiệu: [Số hiệu]
Ngày hiệu lực: [Ngày]
Phạm vi áp dụng: [Phạm vi]
Mức độ tài liệu: [Mức độ]
CHƯƠNG I – [TÊN CHƯƠNG]
Tiểu mục 1
[Nội dung]
Tiểu mục 2
[Nội dung]
CHƯƠNG II – [TÊN CHƯƠNG]
[Tiếp tục cấu trúc tương tự]
GIẢI THÍCH THUẬT NGỮ
[Thuật ngữ]: [Định nghĩa]
LƯU Ý
[Các lưu ý nếu có]
TÀI LIỆU LIÊN QUAN
[Danh sách tài liệu liên quan]
`;