import { TEMPLATE_INSTRUCTION, AppSettings, ProcessingStage } from '../types';
import { extractTextFromPdf } from './pdfService';

export const checkOllamaConnection = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); 

    const response = await fetch(url, { 
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
};

export const convertPdfToMarkdownOllama = async (
  file: File, 
  settings: AppSettings, 
  onUpdate: (stage: ProcessingStage, message: string) => void
): Promise<string> => {
  // 1. Extract text
  let extractedText = "";
  try {
    onUpdate('extracting', "Đang khởi tạo trình đọc PDF...");
    extractedText = await extractTextFromPdf(file, (msg) => onUpdate('extracting', msg));
  } catch (e) {
    throw new Error("Lỗi khi đọc file PDF: " + (e as Error).message);
  }

  if (!extractedText.trim()) {
    throw new Error("File PDF không có nội dung văn bản (có thể là file ảnh scan). Ollama hiện chưa hỗ trợ OCR tốt.");
  }
  
  onUpdate('extracting', `Trích xuất hoàn tất. Độ dài: ${extractedText.length} ký tự.`);

  // 2. Prepare Prompt
  const prompt = `
    ĐÓNG VAI TRÒ: Bạn là một "Máy định dạng văn bản chính xác" (Precision Text Formatter).
    NHIỆM VỤ: Chuyển đổi văn bản thô từ PDF sang định dạng Markdown, tuân thủ tuyệt đối nội dung gốc.

    NGUYÊN TẮC BẤT KHẢ XÂM PHẠM (BẮT BUỘC):
    1. GIỮ NGUYÊN VẸN NỘI DUNG: Không được tóm tắt, không được cắt bỏ, không được viết lại bất kỳ câu chữ nào của văn bản gốc.
    2. CHÍNH XÁC TUYỆT ĐỐI: Giữ nguyên các số liệu, ngày tháng, tên riêng, điều khoản, số thứ tự.
    3. KHÔNG SÁNG TẠO: Không thêm lời dẫn, không thêm nhận xét.
    4. CẤU TRÚC: Sử dụng Template dưới đây để định hình cấu trúc.

    TEMPLATE CẤU TRÚC:
    ${TEMPLATE_INSTRUCTION}

    VĂN BẢN GỐC TỪ FILE PDF:
    ${extractedText}

    YÊU CẦU ĐẦU RA:
    - Chỉ trả về nội dung Markdown.
    - Không dùng code block (\`\`\`).
  `;

  // 3. Call Ollama API
  try {
    onUpdate('uploading', `Đang kết nối tới Local Server (${settings.ollamaUrl})...`);
    onUpdate('generating', `Đang gửi yêu cầu tới model ${settings.ollamaModel}...`);
    onUpdate('generating', "Quá trình này có thể mất vài phút tùy thuộc vào phần cứng...");

    const response = await fetch(`${settings.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.ollamaModel,
        prompt: prompt,
        stream: false, 
        options: {
            temperature: 0.1, 
            num_ctx: 16384,   
        }
      }),
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 0) {
        throw new Error("Lỗi kết nối Ollama (CORS). Hãy chạy lệnh: OLLAMA_ORIGINS=\"*\" ollama serve");
      }
      if (response.status === 404) {
         throw new Error(`Model '${settings.ollamaModel}' không tồn tại. Hãy chạy 'ollama pull ${settings.ollamaModel}'`);
      }
      throw new Error(`Ollama Server Error: ${response.status} ${response.statusText}`);
    }

    onUpdate('formatting', "Đang nhận dữ liệu phản hồi...");
    const data = await response.json();
    
    if (data.done === false) {
       onUpdate('formatting', "Cảnh báo: Phản hồi chưa hoàn tất.");
    }

    onUpdate('formatting', "Xử lý kết quả hoàn tất.");
    return data.response;

  } catch (error: any) {
    console.error("Ollama Service Error:", error);
    if (error.message.includes("Failed to fetch")) {
         throw new Error(`Không thể kết nối đến Ollama tại ${settings.ollamaUrl}. Đảm bảo ứng dụng Ollama đang chạy.`);
    }
    throw error;
  }
};