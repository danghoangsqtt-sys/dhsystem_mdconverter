import { GoogleGenAI } from "@google/genai";
import { extractTextFromPdf } from './pdfService';
import { TEMPLATE_INSTRUCTION, ProcessingStage } from '../types';

/* =======================
   CONFIG & UTILS
======================= */
// Sử dụng gemini-1.5-flash vì context window lớn (1M tokens) và chi phí thấp/miễn phí tốt hơn Pro.
const MODEL_NAME = 'gemini-1.5-flash';

// CHIẾN LƯỢC CHUNKING MỚI CHO TÀI LIỆU DÀI (5-200 TRANG):
// Gemini Flash hỗ trợ 1M token (~3-4 triệu ký tự).
// Tuy nhiên, giới hạn Output token là 8192. Nếu gửi quá nhiều trang 1 lúc, model sẽ không kịp viết hết Markdown.
// Giới hạn Request (RPM) của gói Free là 15 request/phút.
// -> Giải pháp: Tăng kích thước Chunk lên lớn (80,000 ký tự ~ 25 trang) để giảm số lượng Request.
// -> Kết hợp Delay giữa các request để không vượt quá 15 RPM.

const MAX_CHARS_PER_CHUNK = 80000; 
const BASE_DELAY_MS = 10000; // Nghỉ 10s giữa các chunk thành công để làm mát quota.

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Hàm cắt nhỏ văn bản thông minh
function splitTextIntoChunks(text: string): string[] {
  // Tách theo trang trước (marker từ pdfService)
  const pages = text.split(/--- TRANG \d+ ---/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const page of pages) {
    if (!page.trim()) continue;
    
    // Nếu trang hiện tại + trang mới vượt quá giới hạn -> Đẩy chunk cũ vào mảng, tạo chunk mới
    if ((currentChunk + page).length > MAX_CHARS_PER_CHUNK) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = page;
    } else {
      currentChunk += "\n" + page;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

/* =======================
   MAIN SERVICE
======================= */
export const convertPdfToMarkdownGemini = async (
  file: File,
  apiKey: string,
  onUpdate: (stage: ProcessingStage, message: string) => void
): Promise<string> => {

  if (!apiKey) throw new Error("Vui lòng nhập API Key.");

  try {
    // 1. TRÍCH XUẤT VĂN BẢN
    onUpdate('extracting', "Đang đọc toàn bộ nội dung PDF...");
    const fullText = await extractTextFromPdf(file, (msg) => onUpdate('extracting', msg));

    if (!fullText || fullText.length < 50) {
      throw new Error("Không lấy được nội dung văn bản (OCR thất bại).");
    }

    // 2. CHIA NHỎ VĂN BẢN
    onUpdate('extracting', "Đang phân tích và chia nhỏ tài liệu...");
    const chunks = splitTextIntoChunks(fullText);
    onUpdate('extracting', `Đã chia tài liệu thành ${chunks.length} phần lớn (Mỗi phần ~${(MAX_CHARS_PER_CHUNK/3000).toFixed(0)} trang).`);

    // 3. KHỞI TẠO GEMINI (NEW SDK)
    const ai = new GoogleGenAI({ apiKey: apiKey });
    let finalMarkdown = "";

    // 4. XỬ LÝ TỪNG PHẦN (SEQUENTIAL)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isFirst = i === 0;

      // Log chi tiết cho người dùng yên tâm chờ đợi
      const progressMsg = `Đang xử lý phần ${i + 1}/${chunks.length}. Vui lòng chờ, tốc độ được điều chỉnh để tránh lỗi...`;
      onUpdate('generating', progressMsg);

      // DELAY CHIẾN LƯỢC: Nếu không phải phần đầu, bắt buộc nghỉ để tránh lỗi 429
      if (!isFirst) {
          console.log(`Cooling down system for ${BASE_DELAY_MS}ms...`);
          await wait(BASE_DELAY_MS);
      }

      const systemInstruction = `
        Bạn là "DocuMark AI" - Chuyên gia chuyển đổi văn bản hành chính sang Markdown.
        NHIỆM VỤ: Chuyển đổi văn bản thô OCR sang Markdown sạch, giữ nguyên cấu trúc pháp lý.
        
        QUY TẮC BẤT DI BẤT DỊCH:
        1. KHÔNG TÓM TẮT. Giữ nguyên vẹn từng câu chữ.
        2. Nếu văn bản bị cắt giữa chừng (do chia nhỏ), hãy chuyển đổi đến hết khả năng, KHÔNG tự bịa phần kết.
        3. KHÔNG thêm các câu giao tiếp như "Đây là kết quả", "Dưới đây là văn bản". Chỉ trả về Markdown.
      `;

      const prompt = `
        ${isFirst ? `
        ĐÂY LÀ PHẦN ĐẦU TIÊN CỦA TÀI LIỆU.
        HÃY ÁP DỤNG CẤU TRÚC TEMPLATE SAU CHO PHẦN ĐẦU (METADATA):
        ${TEMPLATE_INSTRUCTION}
        ` : "ĐÂY LÀ PHẦN TIẾP THEO. KHÔNG LẶP LẠI TIÊU ĐỀ/METADATA. TIẾP TỤC CHUYỂN ĐỔI NỘI DUNG NỐI TIẾP."}

        NỘI DUNG CẦN CHUYỂN ĐỔI:
        ${chunk}
      `;

      // RETRY LOGIC MẠNH MẼ CHO LỖI 429
      let attempts = 0;
      let success = false;
      const MAX_RETRIES = 5;

      while (attempts < MAX_RETRIES && !success) {
        try {
          // Call API using new SDK standard
          const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.3, // Thấp để chính xác
            }
          });

          const text = response.text;
          if (text) {
            finalMarkdown += text + "\n\n";
            success = true;
          } else {
             throw new Error("Empty response from AI");
          }

        } catch (err: any) {
          attempts++;
          const msg = err.message || JSON.stringify(err);
          console.warn(`Attempt ${attempts} failed:`, msg);

          // Xử lý đặc biệt cho lỗi 429 (Resource Exhausted / Quota)
          if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
            const retryWait = 60000; // Chờ hẳn 60 giây nếu bị 429
            onUpdate('generating', `Hệ thống đang quá tải (Lỗi 429). Đang tạm dừng 60s để phục hồi quota... (Thử ${attempts}/${MAX_RETRIES})`);
            await wait(retryWait);
          } 
          // Các lỗi khác (503, Network...)
          else {
            if (attempts >= MAX_RETRIES) throw err;
            const retryWait = 5000 * attempts;
            onUpdate('generating', `Lỗi kết nối. Thử lại sau ${retryWait/1000}s...`);
            await wait(retryWait);
          }
        }
      }
    }

    onUpdate('formatting', "Đang hoàn tất định dạng...");
    return finalMarkdown;

  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    // User friendly error message
    let userMsg = "Lỗi xử lý AI.";
    if (error.message.includes("429")) userMsg = "Bạn đã dùng hết hạn ngạch miễn phí hôm nay hoặc gửi quá nhanh.";
    if (error.message.includes("API Key")) userMsg = "API Key không hợp lệ.";
    
    throw new Error(userMsg + " (" + error.message + ")");
  }
};