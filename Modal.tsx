import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  type?: 'info' | 'success' | 'error' | 'confirm';
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  onConfirm,
  confirmText = 'OK',
  cancelText = 'Cancel'
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`relative w-full ${type === 'info' || type === 'error' ? 'max-w-2xl' : 'max-w-md'} bg-white rounded-2xl shadow-2xl overflow-hidden`}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`mt-1 p-2 rounded-full ${
                  type === 'error' ? 'bg-red-100 text-red-600' :
                  type === 'success' ? 'bg-green-100 text-green-600' :
                  type === 'confirm' ? 'bg-amber-100 text-amber-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {type === 'error' ? <AlertCircle size={20} /> :
                   type === 'success' ? <CheckCircle size={20} /> :
                   type === 'confirm' ? <AlertCircle size={20} /> :
                   <Info size={20} />}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                  {message && (
                    <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {message}
                    </p>
                  )}
                </div>
                <button 
                  onClick={onClose}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                {type === 'confirm' && (
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    {cancelText}
                  </button>
                )}
                <button
                  onClick={onConfirm || onClose}
                  className={`px-6 py-2 text-sm font-medium text-white rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 ${
                    type === 'error' ? 'bg-red-500 hover:bg-red-600 shadow-red-100' :
                    type === 'confirm' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100' :
                    'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
