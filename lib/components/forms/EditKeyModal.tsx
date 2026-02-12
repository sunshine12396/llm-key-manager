import React, { useState, useEffect } from 'react';
import { KeyMetadata } from '../../models/types';
import { Save, Info } from 'lucide-react';
import { Modal, Button, Input, Label, Badge } from '../ui';

interface EditKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, newLabel: string, priority: 'high' | 'medium' | 'low') => Promise<void>;
    keyData: KeyMetadata | null;
}

export const EditKeyModal: React.FC<EditKeyModalProps> = ({ isOpen, onClose, onSave, keyData }) => {
    const [label, setLabel] = useState('');
    const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (keyData) {
            setLabel(keyData.label);
            setPriority(keyData.priority || 'medium');
        }
    }, [keyData]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!keyData || !label.trim()) return;

        setIsSaving(true);
        try {
            await onSave(keyData.id, label, priority);
            onClose();
        } catch (error) {
            console.error('Failed to update key:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (!keyData) return null;

    const footer = (
        <>
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
            </Button>
            <Button
                variant="secondary"
                onClick={handleSubmit}
                disabled={isSaving || !label.trim()}
                isLoading={isSaving}
                className="min-w-[140px]"
            >
                <Save className="h-4 w-4 mr-2" />
                Update Key
            </Button>
        </>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Modify Key Configuration"
            footer={footer}
            maxWidth="max-w-md"
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-5">
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2 block">
                            PROVIDER
                        </Label>
                        <div className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-xl">
                            <Badge variant="indigo" size="sm" className="bg-slate-900 border-indigo-500/20 text-indigo-400">
                                {keyData.providerId}
                            </Badge>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Read Only</span>
                        </div>
                    </div>

                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2 block">
                            DISPLAY LABEL
                        </Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g. Production API"
                            required
                        />
                    </div>

                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2 block">
                            USE PRIORITY
                        </Label>
                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                            className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-all hover:border-indigo-500/50"
                        >
                            <option value="high">HIGH PRIORITY ⚡</option>
                            <option value="medium">MEDIUM PRIORITY</option>
                            <option value="low">LOW PRIORITY</option>
                        </select>
                        <p className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                            <Info className="h-3.5 w-3.5 text-indigo-400" />
                            High priority keys are selected first during auto-switching
                        </p>
                    </div>

                    <div className="pt-2">
                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2 block">
                            INTERNAL REFERENCE ID
                        </Label>
                        <div className="font-mono text-[10px] bg-slate-800 p-2 rounded-lg border border-slate-700 text-slate-400 overflow-x-auto">
                            {keyData.id}
                        </div>
                    </div>
                </div>
            </form>
        </Modal>
    );
};
