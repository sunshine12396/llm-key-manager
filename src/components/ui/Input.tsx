import React from 'react';
import { cn } from '../../utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, error, ...props }, ref) => {
        return (
            <input
                ref={ref}
                className={cn(
                    "flex h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-50 ring-offset-slate-950 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/20 focus-visible:border-green-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
                    error && "border-red-500 focus-visible:ring-red-500/20",
                    className
                )}
                {...props}
            />
        );
    }
);
Input.displayName = "Input";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
    ({ className, ...props }, ref) => (
        <label
            ref={ref}
            className={cn(
                "text-sm font-semibold text-slate-300 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 block",
                className
            )}
            {...props}
        />
    )
);
Label.displayName = "Label";
