import React from 'react';
import { Key, Plus } from 'lucide-react';
import { Card, Button } from '../ui';

interface EmptyStateProps {
    onAddKey: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAddKey }) => {
    return (
        <Card glass className="p-12 text-center transition-all hover:bg-slate-900/90 hover:border-green-500/30 hover:shadow-xl border-dashed border-slate-700 bg-slate-900/50">
            <div className="bg-green-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in-50 duration-500 shadow-inner ring-1 ring-green-500/20">
                <Key className="h-10 w-10 text-green-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No API keys found</h3>
            <p className="text-sm text-slate-400 mb-8 max-w-sm mx-auto font-medium">
                Get started by adding your first API key securely to the vault. Your credentials never leave your browser.
            </p>
            <Button
                size="lg"
                onClick={onAddKey}
                variant="primary"
                className="group"
            >
                <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
                Add Your First Key
            </Button>
        </Card>
    );
};
