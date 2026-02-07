import React from 'react';
import { Key, Plus } from 'lucide-react';
import { Card, Button } from '../ui';

interface EmptyStateProps {
    onAddKey: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAddKey }) => {
    return (
        <Card glass className="p-12 text-center transition-all hover:bg-white/90 hover:border-indigo-300 hover:shadow-xl border-dashed">
            <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in-50 duration-500 shadow-inner">
                <Key className="h-10 w-10 text-indigo-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">No API keys found</h3>
            <p className="text-sm text-slate-500 mb-8 max-w-sm mx-auto font-medium">
                Get started by adding your first API key securely to the vault. Your credentials never leave your browser.
            </p>
            <Button
                size="lg"
                onClick={onAddKey}
                variant="secondary"
                className="group"
            >
                <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
                Add Your First Key
            </Button>
        </Card>
    );
};
