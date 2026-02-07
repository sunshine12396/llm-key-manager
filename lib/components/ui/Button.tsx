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
            primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm active:scale-95",
            secondary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm active:scale-95",
            ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
            outline: "bg-transparent border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300",
            danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100"
        };

        const sizes = {
            sm: "px-3 py-1.5 text-xs",
            md: "px-5 py-2 text-sm",
            lg: "px-6 py-3 text-base",
            icon: "p-2"
        };

        return (
            <button
                ref={ref}
                disabled={disabled || isLoading}
                aria-busy={isLoading}
                className={cn(
                    "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none",
                    variants[variant],
                    sizes[size],
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
