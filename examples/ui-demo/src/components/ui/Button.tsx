import React from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
        const variants = {
            primary: "bg-green-500 text-white hover:bg-green-600 shadow-sm active:scale-95 border border-green-600/20",
            secondary: "bg-transparent text-slate-200 border-2 border-slate-700 hover:bg-slate-800 hover:border-slate-600 active:scale-95",
            ghost: "bg-transparent text-slate-400 hover:text-white hover:bg-white/5 active:scale-95",
            outline: "bg-transparent border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600",
            danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40"
        };

        const sizes = {
            sm: "px-3 py-1.5 text-xs",
            md: "px-6 py-3 text-sm font-semibold", // DS: 12px 24px
            lg: "px-8 py-4 text-base font-bold",
            icon: "p-2 aspect-square"
        };

        return (
            <button
                ref={ref}
                disabled={disabled || isLoading}
                aria-busy={isLoading}
                className={cn(
                    "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
                    variants[variant as keyof typeof variants] || variants.primary,
                    sizes[size as keyof typeof sizes] || sizes.md,
                    className
                )}
                {...props}
            >
                {isLoading && (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                )}
                {children}
            </button>
        );
    }
);
Button.displayName = "Button";
