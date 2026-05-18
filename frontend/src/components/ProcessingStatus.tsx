import React, { useEffect, useRef } from 'react';
import { Loader2, FileText, Cpu, CheckCircle2, Server, Terminal, Sparkles } from 'lucide-react';
import type { ProcessingStage } from '../types';

interface ProcessingStatusProps {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[];
  uploadProgress: number;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ isProcessing, stage, message, logs, uploadProgress }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!isProcessing) return null;

  const steps = [
    { id: 'uploading', label: 'Tải lên', icon: Server },
    { id: 'extracting', label: 'Đọc PDF', icon: FileText },
    { id: 'generating', label: 'Phân tích', icon: Cpu },
    { id: 'formatting', label: 'Định dạng', icon: Sparkles },
  ];

  const getCurrentStepIndex = () => {
    if (stage === 'complete') return steps.length;
    return steps.findIndex(s => s.id === stage);
  };

  const currentStepIndex = getCurrentStepIndex();

  // Estimate time remaining based on current stage
  const getEstimatedTime = () => {
    switch (stage) {
      case 'uploading': return 'Khoảng 1-2 phút';
      case 'extracting': return 'Khoảng 40-90 giây';
      case 'generating': return 'Khoảng 20-60 giây';
      case 'formatting': return 'Sắp xong...';
      default: return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 text-center border-b border-gray-100 bg-gray-50">
          <div className="relative inline-block mb-4">
             <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-75"></div>
             <div className="relative bg-white p-3 rounded-full border border-blue-100 shadow-sm">
               <Loader2 size={28} className="text-blue-600 animate-spin" />
             </div>
          </div>
          <h3 className="text-lg font-bold text-gray-800">{message}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {getEstimatedTime()} • Vui lòng không tắt trình duyệt
          </p>
        </div>

        {/* Upload Progress Bar — only visible during upload stage */}
        {stage === 'uploading' && uploadProgress > 0 && (
          <div className="px-8 pt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Đang tải lên...</span>
              <span className="font-mono font-semibold text-blue-600">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Stepper */}
        <div className="px-8 py-6">
          <div className="flex justify-between relative">
            {/* Connecting Line (background) */}
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2 rounded"></div>
            {/* Connecting Line (active progress) */}
            <div 
              className="absolute top-1/2 left-0 h-0.5 bg-blue-500 -z-10 -translate-y-1/2 rounded transition-all duration-700 ease-out"
              style={{ width: `${Math.max(0, (currentStepIndex / (steps.length - 1)) * 100)}%` }}
            ></div>

            {steps.map((s, index) => {
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              const Icon = isCompleted ? CheckCircle2 : s.icon;

              return (
                <div key={s.id} className="flex flex-col items-center bg-white px-1">
                  <div 
                    className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-500
                      ${isCompleted 
                        ? 'border-green-500 bg-green-50 text-green-600' 
                        : isActive 
                          ? 'border-blue-500 bg-blue-50 text-blue-600 shadow-md shadow-blue-100' 
                          : 'border-gray-200 bg-white text-gray-300'}
                    `}
                  >
                    {isActive ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Icon size={14} />
                    )}
                  </div>
                  <span className={`text-[10px] mt-2 font-medium transition-colors duration-300
                    ${isCompleted ? 'text-green-700' : isActive ? 'text-blue-700' : 'text-gray-400'}
                  `}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Logs */}
        <div className="flex-1 bg-gray-900 p-4 overflow-hidden flex flex-col min-h-[150px]">
          <div className="flex items-center space-x-2 text-gray-400 mb-2 border-b border-gray-700 pb-2">
            <Terminal size={14} />
            <span className="text-xs font-mono uppercase tracking-wider">System Activity Log</span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1.5 custom-scrollbar pr-2">
            {logs.length === 0 && <span className="text-gray-600 italic">Initializing...</span>}
            {logs.map((log, idx) => (
              <div key={idx} className="flex space-x-2 animate-fade-in">
                <span className={`select-none ${log.startsWith('✅') ? 'text-green-400' : 'text-blue-500 opacity-50'}`}>
                  {log.startsWith('✅') ? '✓' : '>'}
                </span>
                <span className={`break-words ${log.startsWith('✅') ? 'text-green-300 font-semibold' : 'text-gray-300'}`}>
                  {log}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default ProcessingStatus;