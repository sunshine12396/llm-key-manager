
import React from 'react';

interface KeyUsageBarProps {
    modelName: string;
    percentage: number;
    color?: string;
}

export const KeyUsageBar: React.FC<KeyUsageBarProps> = ({ modelName, percentage, color = 'bg-blue-600' }) => {
    // Ensure percentage is between 0 and 100
    const clampedPercentage = Math.min(Math.max(percentage, 0), 100);

    return (
        <div className="w-full">
            <div className="flex justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{modelName}</span>
                <span className="text-xs font-medium text-gray-700">{Math.round(clampedPercentage)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                    className={`h-2 rounded-full ${color} transition-all duration-500`} 
                    style={{ width: `${clampedPercentage}%` }}
                ></div>
            </div>
        </div>
    );
};
