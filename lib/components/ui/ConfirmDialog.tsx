import React from 'react';
import { cn } from '../../utils/cn';
import { AlertTriangle, Trash2, Info, HelpCircle, X } from 'lucide-react';
import { Button } from './Button';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info' | 'question';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string | React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmDialogVariant;
    isLoading?: boolean;
}

const variantConfig: Record<ConfirmDialogVariant, {
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    confirmButtonClass: string;
}> = {
    danger: {
        icon: <Trash2 className="h-6 w-6" />,
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        confirmButtonClass: 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/25'
    },
    warning: {
        icon: <AlertTriangle className="h-6 w-6" />,
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        confirmButtonClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/25'
    },
    info: {
        icon: <Info className="h-6 w-6" />,
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        confirmButtonClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25'
    },
    question: {
        icon: <HelpCircle className="h-6 w-6" />,
        iconBg: 'bg-indigo-100',
        iconColor: 'text-indigo-600',
        confirmButtonClass: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25'
    }
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    isLoading = false
}) => {
    if (!isOpen) return null;

    const config = variantConfig[variant];

    const handleConfirm = () => {
        onConfirm();
        if (!isLoading) {
            onClose();
        }
    };

    // Handle ESC key
    React.useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isLoading) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose, isLoading]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={isLoading ? undefined : onClose}
            />

            {/* Dialog */}
            <div
                className={cn(
                    "relative bg-white rounded-2xl shadow-2xl w-full max-w-md",
                    "border border-slate-200/80",
                    "animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-300",
                    "overflow-hidden"
                )}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    disabled={isLoading}
                    className={cn(
                        "absolute top-4 right-4 p-1.5 rounded-full",
                        "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
                        "transition-colors duration-200",
                        isLoading && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <X className="h-4 w-4" />
                </button>

                {/* Content */}
                <div className="px-6 pt-8 pb-6">
                    {/* Icon */}
                    <div className="flex justify-center mb-5">
                        <div className={cn(
                            "p-4 rounded-full",
                            "animate-in zoom-in-50 duration-500 delay-100",
                            config.iconBg
                        )}>
                            <div className={cn(
                                "animate-in spin-in-180 duration-500 delay-150",
                                config.iconColor
                            )}>
                                {config.icon}
                            </div>
                        </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-slate-900 text-center mb-2">
                        {title}
                    </h3>

                    {/* Message */}
                    <p className="text-slate-600 text-center text-sm leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 px-6 pb-6 pt-2">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 h-11 font-semibold border-slate-200 hover:bg-slate-50"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isLoading}
                        className={cn(
                            "flex-1 h-11 font-semibold shadow-lg",
                            config.confirmButtonClass
                        )}
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Processing...
                            </span>
                        ) : confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
};

// Hook for easier usage
interface UseConfirmOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmDialogVariant;
}

interface ConfirmState {
    isOpen: boolean;
    options: UseConfirmOptions;
    resolve: ((value: boolean) => void) | null;
}

export const useConfirm = () => {
    const [state, setState] = React.useState<ConfirmState>({
        isOpen: false,
        options: {},
        resolve: null
    });

    const confirm = React.useCallback((options: UseConfirmOptions = {}): Promise<boolean> => {
        return new Promise((resolve) => {
            setState({
                isOpen: true,
                options,
                resolve
            });
        });
    }, []);

    const handleClose = React.useCallback(() => {
        setState(prev => {
            prev.resolve?.(false);
            return { isOpen: false, options: {}, resolve: null };
        });
    }, []);

    const handleConfirm = React.useCallback(() => {
        setState(prev => {
            prev.resolve?.(true);
            return { isOpen: false, options: {}, resolve: null };
        });
    }, []);

    const ConfirmDialogComponent = React.useCallback(() => (
        <ConfirmDialog
            isOpen={state.isOpen}
            onClose={handleClose}
            onConfirm={handleConfirm}
            title={state.options.title || 'Confirm'}
            message={state.options.message || 'Are you sure?'}
            confirmText={state.options.confirmText}
            cancelText={state.options.cancelText}
            variant={state.options.variant}
        />
    ), [state, handleClose, handleConfirm]);

    return { confirm, ConfirmDialog: ConfirmDialogComponent };
};
