export type ProcessingStage = 'idle' | 'extracting' | 'uploading' | 'generating' | 'formatting' | 'complete';

export interface ProcessingState {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[];
  error: string | null;
  success: boolean;
}

export type AIProvider = 'ollama' | 'gemini';

export interface AppSettings {
  provider: AIProvider;
  ollamaModel: string;
  ollamaUrl: string;
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

// ĐÃ SỬA: Xóa bỏ phần "GHI CHÚ SOẠN THẢO" gây nhiễu
// Chỉ giữ lại khung sườn (Skeleton) để AI điền vào
export const TEMPLATE_INSTRUCTION = `
# [TIÊU ĐỀ VĂN BẢN (VIẾT HOA)]
> [Mô tả ngắn gọn loại văn bản]

---

## METADATA VĂN BẢN
**Tên văn bản:** [Trích xuất tên đầy đủ]
**Cơ quan ban hành:** [Trích xuất cơ quan]
**Số / ký hiệu:** [Trích xuất số hiệu]
**Ngày ban hành:** [Trích xuất ngày tháng năm]
**Ngày hiệu lực:** [Trích xuất ngày hiệu lực]
**Người ký:** [Trích xuất người ký]
**Phạm vi áp dụng:** [Trích xuất phạm vi]

---

## NỘI DUNG CHI TIẾT

[Trích xuất toàn bộ nội dung văn bản gốc, giữ nguyên cấu trúc Chương, Điều, Khoản, Điểm]

### [Tên Phần / Chương]

#### [Tên Mục / Điều]
[Nội dung điều khoản...]

---

## LƯU Ý
[Các ghi chú quan trọng khác từ văn bản gốc]
`;