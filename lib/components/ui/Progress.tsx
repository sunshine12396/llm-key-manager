import React from 'react';
import { cn } from '../../utils/cn';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value: number;
    max?: number;
    indicatorClassName?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
    ({ className, value, max = 100, indicatorClassName, ...props }, ref) => {
        const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

        return (
            <div
                ref={ref}
                className={cn(
                    "relative h-2 w-full overflow-hidden rounded-full bg-slate-100",
                    className
                )}
                {...props}
            >
                <div
                    className={cn("h-full w-full flex-1 bg-indigo-600 transition-all duration-300", indicatorClassName)}
                    style={{ transform: `translateX(-${100 - percentage}%)` }}
                />
            </div>
        );
    }
);
Progress.displayName = "Progress";
