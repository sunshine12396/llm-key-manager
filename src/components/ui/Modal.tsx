import React from 'react';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, maxWidth = 'max-w-md' }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div
                className={cn(
                    "relative bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full animate-in zoom-in-95 fade-in duration-200 overflow-hidden",
                    maxWidth
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
                    <h3 className="text-lg font-bold text-slate-50">{title}</h3>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full text-slate-400 hover:text-white hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-6 text-slate-300">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="flex items-center justify-end px-6 py-4 bg-slate-900 border-t border-slate-800 gap-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
