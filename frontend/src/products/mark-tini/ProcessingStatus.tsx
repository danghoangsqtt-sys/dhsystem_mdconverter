import React, { useEffect, useRef } from 'react';
import { CheckCircle2, Clock3, FileUp, Loader2, ScanText, Sparkles, Terminal, XCircle } from 'lucide-react';
import type { ProcessingStage } from './types';

interface ProcessingStatusProps {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[];
  uploadProgress: number;
  progress: number;
  onCancel: () => void;
}

const STEPS: { id: ProcessingStage; label: string; icon: React.ElementType }[] = [
  { id: 'uploading', label: 'Tải lên', icon: FileUp },
  { id: 'queued', label: 'Xếp hàng', icon: Clock3 },
  { id: 'converting', label: 'Phân tích', icon: ScanText },
  { id: 'finalizing', label: 'Hoàn thiện', icon: Sparkles },
];

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  isProcessing,
  stage,
  message,
  logs,
  uploadProgress,
  progress,
  onCancel,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!isProcessing) return null;

  const stageIndex = STEPS.findIndex(step => step.id === stage);
  const currentStepIndex = stage === 'cancelling' ? 2 : Math.max(0, stageIndex);
  const cancelling = stage === 'cancelling';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 text-center border-b border-gray-100 bg-gray-50">
          <div className="relative inline-block mb-4">
            <div className={`absolute inset-0 rounded-full animate-ping opacity-60 ${cancelling ? 'bg-amber-100' : 'bg-blue-100'}`} />
            <div className={`relative bg-white p-3 rounded-full border shadow-sm ${cancelling ? 'border-amber-200' : 'border-blue-100'}`}>
              {cancelling
                ? <XCircle size={28} className="text-amber-600" />
                : <Loader2 size={28} className="text-blue-600 animate-spin" />}
            </div>
          </div>
          <h3 className="text-lg font-bold text-gray-800">{message}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {cancelling
              ? 'Tác vụ ML đang chạy không thể dừng cưỡng bức; kết quả sẽ bị loại bỏ an toàn.'
              : 'Trạng thái được đồng bộ trực tiếp từ backend.'}
          </p>
        </div>

        <div className="px-8 pt-5">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{stage === 'uploading' ? 'Đang tải file...' : 'Tiến độ tác vụ'}</span>
            <span className="font-mono font-semibold text-blue-600">
              {stage === 'uploading' ? uploadProgress : progress}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${cancelling ? 'bg-amber-500' : 'bg-blue-600'}`}
              style={{ width: `${Math.max(0, Math.min(100, stage === 'uploading' ? uploadProgress : progress))}%` }}
            />
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="flex justify-between relative">
            <div className="absolute top-[18px] left-0 w-full h-0.5 bg-gray-200" />
            {STEPS.map((step, index) => {
              const active = index === currentStepIndex;
              const completed = index < currentStepIndex;
              const Icon = completed ? CheckCircle2 : step.icon;
              return (
                <div key={step.id} className="relative flex flex-col items-center bg-white px-1 z-10">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                    completed
                      ? 'border-green-500 bg-green-50 text-green-600'
                      : active
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-gray-200 bg-white text-gray-300'
                  }`}>
                    {active && !cancelling ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                  </div>
                  <span className={`text-[10px] mt-2 font-medium ${completed ? 'text-green-700' : active ? 'text-blue-700' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 bg-gray-900 p-4 overflow-hidden flex flex-col min-h-[130px]">
          <div className="flex items-center space-x-2 text-gray-400 mb-2 border-b border-gray-700 pb-2">
            <Terminal size={14} />
            <span className="text-xs font-mono uppercase tracking-wider">Backend job log</span>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1.5 pr-2">
            {logs.map((log, index) => (
              <div key={`${index}-${log}`} className="flex space-x-2">
                <span className="text-blue-500 opacity-60">›</span>
                <span className="text-gray-300 break-words">{log}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="p-4 bg-white border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="px-4 py-2 text-sm font-medium rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelling ? 'Đang hủy...' : 'Hủy tác vụ'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProcessingStatus;
