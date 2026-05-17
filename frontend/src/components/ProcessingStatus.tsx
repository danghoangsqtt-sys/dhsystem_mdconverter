import React, { useEffect, useRef } from 'react';
import { Loader2, FileText, Cpu, CheckCircle2, Server, Terminal } from 'lucide-react';
import type { ProcessingStage } from '../types';

interface ProcessingStatusProps {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[];
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ isProcessing, stage, message, logs }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!isProcessing) return null;

  const steps = [
    { id: 'extracting', label: 'Đọc PDF', icon: FileText },
    { id: 'uploading', label: 'Kết nối AI', icon: Server },
    { id: 'generating', label: 'Xử lý', icon: Cpu },
    { id: 'formatting', label: 'Định dạng', icon: Terminal },
  ];

  const getCurrentStepIndex = () => {
    if (stage === 'complete') return steps.length;
    return steps.findIndex(s => s.id === stage);
  };

  const currentStepIndex = getCurrentStepIndex();

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
          <p className="text-xs text-gray-500 mt-1">Vui lòng không tắt trình duyệt</p>
        </div>

        {/* Stepper */}
        <div className="px-8 py-6">
          <div className="flex justify-between relative">
            {/* Connecting Line */}
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2 rounded"></div>
            <div 
              className="absolute top-1/2 left-0 h-0.5 bg-blue-500 -z-10 -translate-y-1/2 rounded transition-all duration-500"
              style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
            ></div>

            {steps.map((s, index) => {
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              const Icon = isCompleted ? CheckCircle2 : s.icon;

              return (
                <div key={s.id} className="flex flex-col items-center bg-white px-1">
                  <div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300
                      ${isActive || isCompleted 
                        ? 'border-blue-500 bg-blue-50 text-blue-600' 
                        : 'border-gray-200 bg-white text-gray-300'}
                    `}
                  >
                    <Icon size={14} />
                  </div>
                  <span className={`text-[10px] mt-2 font-medium ${isActive || isCompleted ? 'text-blue-700' : 'text-gray-400'}`}>
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
                <span className="text-blue-500 opacity-50 select-none">{'>'}</span>
                <span className="text-gray-300 break-words">{log}</span>
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