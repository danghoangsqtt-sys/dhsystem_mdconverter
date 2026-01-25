import { TEMPLATE_INSTRUCTION, AppSettings } from '../types';
import { extractTextFromPdf } from './pdfService';

// Thêm hàm này vào file services/ollamaService.ts
export const checkOllamaStatus = async (): Promise<boolean> => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    return response.ok;
  } catch (error) {
    return false;
  }
};

export const checkOllamaConnection = async (url: string): Promise<boolean> => {
  try {
    // Ollama root usually returns text "Ollama is running"
    // We use a simple fetch with a short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

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

export const convertPdfToMarkdownOllama = async (file: File, settings: AppSettings): Promise<string> => {
  // 1. Extract text first (since Ollama text models don't read PDF binary directly)
  let extractedText = "";
  try {
    extractedText = await extractTextFromPdf(file);
  } catch (e) {
    throw new Error("Lỗi khi đọc file PDF: " + (e as Error).message);
  }

  if (!extractedText.trim()) {
    throw new Error("File PDF không có nội dung văn bản (có thể là file ảnh scan). Ollama hiện chưa hỗ trợ OCR tốt.");
  }

  // 2. Prepare Prompt
  const prompt = `
    Bạn là một chuyên gia chuyển đổi văn bản hành chính/quân sự.
    Nhiệm vụ: Chuyển đổi văn bản thô bên dưới thành định dạng Markdown chuẩn.
    
    VĂN BẢN GỐC TỪ FILE PDF:
    ${extractedText}

    QUAN TRỌNG: Bạn BẮT BUỘC phải tuân thủ nghiêm ngặt cấu trúc template sau đây cho đầu ra. 
    Không thêm lời dẫn, không thêm markdown block (\\\`\\\`\\\`), chỉ trả về nội dung raw markdown.

    TEMPLATE MẪU:
    ${TEMPLATE_INSTRUCTION}

    Hãy điền thông tin từ văn bản gốc vào các phần tương ứng của template.
    Giữ nguyên các tiêu đề (#, ##), in đậm (**text**).
  `;

  // 3. Call Ollama API
  try {
    const response = await fetch(`${settings.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.ollamaModel,
        prompt: prompt,
        stream: false, // We want the full response at once for this use case
        options: {
            temperature: 0.2, // Low temperature for more deterministic/faithful output
            num_ctx: 8192,    // Increase context window for large docs (requires memory)
        }
      }),
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 0) {
        throw new Error("Lỗi kết nối Ollama (CORS). Hãy chạy lệnh: OLLAMA_ORIGINS=\"*\" ollama serve");
      }
      throw new Error(`Ollama Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;

  } catch (error: any) {
    console.error("Ollama Service Error:", error);
    if (error.message.includes("Failed to fetch")) {
         throw new Error("Không thể kết nối đến Ollama. Hãy đảm bảo Ollama đang chạy tại " + settings.ollamaUrl);
    }
    throw error;
  }
};