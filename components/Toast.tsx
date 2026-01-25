import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
    toasts: ToastMessage[];
    removeToast: (id: number) => void;
}

const Toast: React.FC<ToastProps> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
            ))}
        </div>
    );
};

const ToastItem: React.FC<{ toast: ToastMessage; removeToast: (id: number) => void }> = ({ toast, removeToast }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            removeToast(toast.id);
        }, 5000); // Auto remove after 5s
        return () => clearTimeout(timer);
    }, [toast.id, removeToast]);

    const styles = {
        success: 'bg-green-50 border-green-200 text-green-800',
        error: 'bg-red-50 border-red-200 text-red-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800',
    };

    const Icons = {
        success: CheckCircle,
        error: AlertCircle,
        info: Info,
    };

    const Icon = Icons[toast.type];

    return (
        <div className={`${styles[toast.type]} border shadow-lg rounded-lg p-4 flex items-start space-x-3 w-80 animate-fade-in`}>
            <Icon size={20} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm font-medium">{toast.message}</div>
            <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
};

export default Toast;