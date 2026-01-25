import React from 'react';
import { Download, Terminal, X, ExternalLink } from 'lucide-react';

interface InstallOllamaModalProps {
  onClose: () => void;
  onConfirm: () => void;
  ollamaUrl: string;
}

const InstallOllamaModal: React.FC<InstallOllamaModalProps> = ({ onClose, onConfirm, ollamaUrl }) => {
  const handleDownload = () => {
    // Open official download page
    window.open('https://ollama.com/download', '_blank');
    onConfirm(); // Move to next step or close
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2 text-white">
            <Terminal size={24} className="text-blue-400" />
            <h3 className="text-lg font-bold">Cài đặt Ollama AI</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <h4 className="text-gray-900 font-semibold text-lg mb-2">Không tìm thấy Ollama trên máy tính của bạn</h4>
            <p className="text-gray-600 text-sm leading-relaxed">
              Để sử dụng tính năng AI Offline (không cần internet), bạn cần cài đặt phần mềm <strong>Ollama</strong>. 
              Đây là nền tảng giúp chạy các mô hình AI trực tiếp trên máy tính cá nhân.
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600 mt-1">
                  <Download size={18} />
                </div>
                <div>
                  <h5 className="font-semibold text-blue-900 text-sm">Bước 1: Tải và Cài đặt</h5>
                  <p className="text-xs text-blue-700 mt-1">
                    Nhấn nút bên dưới để tải bộ cài đặt từ trang chủ Ollama.com
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="bg-gray-200 p-2 rounded-full text-gray-700 mt-1">
                  <Terminal size={18} />
                </div>
                <div>
                  <h5 className="font-semibold text-gray-900 text-sm">Bước 2: Cấp quyền kết nối</h5>
                  <p className="text-xs text-gray-600 mt-1 mb-2">
                    Sau khi cài xong, bạn cần chạy lệnh này trong Terminal/PowerShell để web app có thể kết nối:
                  </p>
                  <code className="block bg-black text-green-400 p-2 rounded text-xs font-mono break-all select-all">
                    OLLAMA_ORIGINS="*" ollama serve
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex space-x-3">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Để sau
            </button>
            <button 
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition-colors"
            >
              <ExternalLink size={16} />
              <span>Tải về & Cài đặt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallOllamaModal;