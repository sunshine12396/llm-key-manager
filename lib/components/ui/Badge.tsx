import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'indigo' | 'emerald' | 'amber' | 'red' | 'slate' | 'outline';
    size?: 'sm' | 'md';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', size = 'md', ...props }, ref) => {
        const variants = {
            default: "bg-slate-800 text-slate-300 border-slate-700",
            indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
            emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
            amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
            red: "bg-red-500/10 text-red-400 border-red-500/20",
            slate: "bg-slate-800 text-slate-400 border-slate-700",
            outline: "bg-transparent border border-slate-700 text-slate-400"
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
