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

// TEMPLATE_INSTRUCTION ĐÃ ĐƯỢC LÀM SẠCH HOÀN TOÀN DỮ LIỆU MẪU
export const TEMPLATE_INSTRUCTION = `
# [TIÊU ĐỀ VĂN BẢN CHÍNH XÁC TỪ FILE PDF]
> [Mô tả loại văn bản, ví dụ: Thông tư / Nghị định / Quyết định]

---

## METADATA VĂN BẢN
**Tên văn bản:** [Trích xuất chính xác tên đầy đủ]
**Cơ quan ban hành:** [Trích xuất cơ quan ban hành]
**Số / ký hiệu:** [Trích xuất số hiệu, ví dụ: 193/2011/TT-BQP]
**Ngày hiệu lực:** [Trích xuất ngày tháng năm ban hành]
**Phạm vi áp dụng:** [Trích xuất đối tượng áp dụng]

---

## NỘI DUNG CHI TIẾT
[Trích xuất và trình bày lại toàn bộ các Chương, Điều, Khoản từ văn bản gốc. Giữ nguyên cấu trúc phân cấp]

### [Tên Chương/Mục]
#### [Tên Điều/Tiểu mục]
- [Nội dung chi tiết...]

---

## GIẢI THÍCH THUẬT NGỮ
[Nếu có, liệt kê theo định dạng: **Thuật ngữ**: Định nghĩa]

## LƯU Ý / ĐIỀU KHOẢN THI HÀNH
[Trích xuất các lưu ý hoặc hiệu lực thi hành]
`;