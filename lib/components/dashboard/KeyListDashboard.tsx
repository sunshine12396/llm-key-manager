import React, { useState } from 'react';
import { KeyMetadata } from '../../models/types';
import useLLMKeyManager from '../../hooks/useLLMKeyManager';
import { EditKeyModal } from '../forms/EditKeyModal';
import { AddKeyForm as AddKeyModal } from '../forms/AddKeyForm';
import {
    RefreshCw,
    Trash2,
    CheckSquare,
    Square,
    Plus,
    Search
} from 'lucide-react';
import { Card, Button, Badge, Input, useConfirm } from '../ui';
import { KeyRow } from './KeyRow';
import { EmptyState } from './EmptyState';
import { cn } from '../../utils/cn';

export const KeyListDashboard: React.FC = () => {
    const { keys, deleteKey, refreshKeys, updateKey, validateKey } = useLLMKeyManager();
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [editingKey, setEditingKey] = useState<KeyMetadata | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isGloballyRefreshing, setIsGloballyRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { confirm, ConfirmDialog } = useConfirm();

    const toggleSelect = (id: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedKeys.size === keys.length) setSelectedKeys(new Set());
        else setSelectedKeys(new Set(keys.map(k => k.id)));
    };

    const handleDelete = async (id: string) => {
        const key = keys.find(k => k.id === id);
        const confirmed = await confirm({
            title: 'Delete API Key?',
            message: `This will permanently delete "${key?.label || 'this key'}". This action cannot be undone.`,
            confirmText: 'Delete Key',
            cancelText: 'Keep It',
            variant: 'danger'
        });
        if (!confirmed) return;

        setIsDeleting(id);
        try {
            await deleteKey(id);
            setSelectedKeys(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        } catch (error) {
            console.error('Failed to delete key:', error);
            // Ideally show a toast here, but for now we rely on console
            alert('Failed to delete key. Please try again.');
        } finally {
            setIsDeleting(null);
        }
    };

    const handleBulkDelete = async () => {
        const confirmed = await confirm({
            title: `Delete ${selectedKeys.size} Keys?`,
            message: `You're about to permanently delete ${selectedKeys.size} API keys. This action cannot be undone.`,
            confirmText: `Delete ${selectedKeys.size} Keys`,
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!confirmed) return;

        try {
            for (const id of selectedKeys) await deleteKey(id);
            setSelectedKeys(new Set());
        } catch (error) {
            console.error('Failed to delete keys:', error);
            alert('Failed to delete some keys. Please try again.');
        }
    };

    const handleGlobalRefresh = async () => {
        setIsGloballyRefreshing(true);
        try {
            const currentKeys = await refreshKeys();
            for (const key of currentKeys) {
                await validateKey(key.id);
            }
        } finally {
            setIsGloballyRefreshing(false);
        }
    };

    const handleKeyRefresh = async (id: string) => {
        await validateKey(id);
    };

    const handleEdit = (id: string) => {
        const key = keys.find(k => k.id === id);
        if (key) setEditingKey(key);
    };

    const handleSaveEdit = async (id: string, newLabel: string, priority: 'high' | 'medium' | 'low') => {
        await updateKey(id, { label: newLabel, priority });
    };

    const handleToggleActive = async (id: string, isEnabled: boolean | undefined) => {
        const newState = !(isEnabled !== false);
        await updateKey(id, { isEnabled: newState });
    };

    const filteredKeys = keys.filter(k =>
        k.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        k.providerId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (keys.length === 0) {
        return (
            <>
                <EmptyState onAddKey={() => setIsAddModalOpen(true)} />
                <AddKeyModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
            </>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Toolbar */}
            <Card className="p-2 border-slate-200/60 shadow-md sticky top-0 z-30 bg-white/90 backdrop-blur-md">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-2">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={selectAll}
                            className={cn(
                                "h-10 w-10 transition-all",
                                selectedKeys.size === keys.length ? "bg-indigo-50 text-indigo-600" : "text-slate-400"
                            )}
                        >
                            {selectedKeys.size === keys.length ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                        </Button>

                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search keys or providers..."
                                className="pl-10 h-10 bg-slate-50/50 border-transparent focus:bg-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                        {selectedKeys.size > 0 ? (
                            <div className="flex items-center gap-2 animate-in slide-in-from-right-2 fade-in">
                                <Badge variant="slate" className="h-10 normal-case px-4">
                                    {selectedKeys.size} selected
                                </Badge>
                                <Button
                                    variant="danger"
                                    onClick={handleBulkDelete}
                                    className="h-10"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={handleGlobalRefresh}
                                    isLoading={isGloballyRefreshing}
                                    className="h-10 w-10"
                                    title="Verify All Keys"
                                >
                                    {!isGloballyRefreshing && <RefreshCw className="h-4 w-4" />}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="h-10 px-6"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add New Key
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* Content List */}
            <Card className="overflow-hidden border-slate-200/60 shadow-sm">
                <div className="bg-slate-50/50 border-b border-slate-100 px-5 py-3 hidden md:flex items-center gap-4">
                    <div className="w-10" /> {/* Checkbox spacer */}
                    <div className="w-56 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Provider & Label</div>
                    <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status & Capabilities</div>
                    <div className="w-24 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Created</div>
                    <div className="w-24" /> {/* Actions spacer */}
                </div>
                <div className="divide-y divide-slate-100">
                    {filteredKeys.length > 0 ? (
                        filteredKeys.map((key) => (
                            <KeyRow
                                key={key.id}
                                keyData={key}
                                selected={selectedKeys.has(key.id)}
                                isDeleting={isDeleting === key.id}
                                onSelect={() => toggleSelect(key.id)}
                                onDelete={() => handleDelete(key.id)}
                                onRefresh={() => handleKeyRefresh(key.id)}
                                onEdit={() => handleEdit(key.id)}
                                onToggleActive={() => handleToggleActive(key.id, key.isEnabled)}
                            />
                        ))
                    ) : (
                        <div className="p-12 text-center">
                            <p className="text-slate-500 font-medium">No keys match your search.</p>
                        </div>
                    )}
                </div>
            </Card>

            <EditKeyModal
                isOpen={!!editingKey}
                onClose={() => setEditingKey(null)}
                onSave={handleSaveEdit}
                keyData={editingKey}
            />

            <AddKeyModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            {/* Confirmation Dialog */}
            <ConfirmDialog />
        </div>
    );
};
