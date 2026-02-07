import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'indigo' | 'emerald' | 'amber' | 'red' | 'slate' | 'outline';
    size?: 'sm' | 'md';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', size = 'md', ...props }, ref) => {
        const variants = {
            default: "bg-slate-100 text-slate-700 border-slate-200",
            indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
            emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
            amber: "bg-amber-50 text-amber-700 border-amber-100",
            red: "bg-red-50 text-red-700 border-red-100",
            slate: "bg-slate-50 text-slate-600 border-slate-200",
            outline: "bg-transparent border border-slate-200 text-slate-600"
        };

        const sizes = {
            sm: "px-1.5 py-0.5 text-[10px]",
            md: "px-2.5 py-1 text-xs"
        };

        return (
            <span
                ref={ref}
                className={cn(
                    "inline-flex items-center font-bold uppercase tracking-wider rounded-full border transition-colors",
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            />
        );
    }
);
Badge.displayName = "Badge";
