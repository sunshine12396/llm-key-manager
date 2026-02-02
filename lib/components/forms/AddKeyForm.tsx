import React, { useState } from 'react';
import useLLMKeyManager from '../../hooks/useLLMKeyManager';
import { AIProviderId } from '../../models/types';
import { Eye, EyeOff, ShieldCheck, Zap, CheckCircle, Wand2 } from 'lucide-react';
import { getProviderAdapter } from '../../providers/provider.registry';
import { Modal, Button, Input, Label, Badge } from '../ui';
import { cn } from '../../utils/cn';

const PROVIDER_CONFIG: Record<AIProviderId, { name: string; placeholder: string; icon: string }> = {
    openai: { name: 'OpenAI', placeholder: 'sk-...', icon: 'O' },
    anthropic: { name: 'Anthropic', placeholder: 'sk-ant-...', icon: 'A' },
    gemini: { name: 'Google Gemini', placeholder: 'AIza...', icon: 'G' }
};

interface AddKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddKeyModal: React.FC<AddKeyModalProps> = ({ isOpen, onClose }) => {
    const { addKey } = useLLMKeyManager();
    const [provider, setProvider] = useState<AIProviderId>('openai');
    const [key, setKey] = useState('');
    const [label, setLabel] = useState('');
    const [isLabelTouched, setIsLabelTouched] = useState(false); // Track manual edits
    const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
    const [showKey, setShowKey] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [addedSuccessfully, setAddedSuccessfully] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Use adapter's validateKeyFormat method
    const adapter = getProviderAdapter(provider);
    const formatValidation = key.length > 0 ? adapter.validateKeyFormat(key) : null;
    const isValidFormat = formatValidation?.isValid ?? false;
    const canSubmit = key.length > 0 && label.length > 0 && isValidFormat && !isSubmitting;

    // Generate label based on provider and key
    const generateLabel = (p: AIProviderId, k: string) => {
        if (!k || k.length <= 4) return '';
        const providerName = PROVIDER_CONFIG[p].name.split(' ')[0];
        const suffix = k.slice(-4);
        return `${providerName} Key ...${suffix}`;
    };

    const handleProviderChange = (newProvider: AIProviderId) => {
        setProvider(newProvider);
        if (!isLabelTouched && key.length > 4) {
             setLabel(generateLabel(newProvider, key));
        }
    };

    const handleAutoGenerateLabel = () => {
        if (key.length <= 4) return;
        setLabel(generateLabel(provider, key));
        setIsLabelTouched(false);
    };

    // Auto-detect provider based on format
    const handleKeyChange = (newKey: string) => {
        setKey(newKey);
        setError(null);

        // Robust heuristic detection
        let detected = provider;
        const k = newKey.trim();
        
        if (k.startsWith('sk-ant-')) detected = 'anthropic';
        else if (k.startsWith('sk-proj-') || (k.startsWith('sk-') && !k.startsWith('sk-ant-'))) detected = 'openai';
        else if (k.startsWith('AIza')) detected = 'gemini';
        
        if (detected !== provider) {
            setProvider(detected);
        }

        // Auto-Label Logic: Update if user hasn't touched label AND key is long enough
        if (!isLabelTouched && newKey.length > 4) {
             setLabel(generateLabel(detected, newKey));
        } else if (!isLabelTouched && newKey.length <= 4) {
             setLabel('');
        }
    };

    const handleLabelChange = (newLabel: string) => {
        setLabel(newLabel);
        setIsLabelTouched(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!canSubmit) return;

        setIsSubmitting(true);

        try {
            await addKey(provider, key, label, priority);

            setAddedSuccessfully(true);

            setTimeout(() => {
                setKey('');
                setLabel('');
                setIsLabelTouched(false);
                setPriority('medium');
                setAddedSuccessfully(false);
                setIsSubmitting(false);
                onClose();
            }, 1200);

        } catch (err: any) {
            console.error('Failed to add key:', err);
            setError(err.message || 'Failed to add key. Please check the format.');
            setIsSubmitting(false);
        }
    };

    const footer = (
        <>
            <Button
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
            >
                Cancel
            </Button>
            <Button
                variant="secondary"
                onClick={handleSubmit}
                disabled={!canSubmit}
                isLoading={isSubmitting && !addedSuccessfully}
                className="min-w-[140px]"
            >
                {addedSuccessfully ? (
                    <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Added!
                    </>
                ) : (
                    'Add Key'
                )}
            </Button>
        </>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Add Security Credential"
            footer={footer}
            maxWidth="max-w-lg"
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Success message */}
                {addedSuccessfully && (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 text-emerald-700 animate-in fade-in slide-in-from-top-2 duration-300">
                        <CheckCircle className="h-5 w-5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-bold">Key Added Successfully!</p>
                            <p className="text-xs opacity-80 mt-1">Background validation is now running. You'll be notified when model discovery completes.</p>
                        </div>
                    </div>
                )}

                {/* Error message */}
                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-top-2 duration-300">
                        <CheckCircle className="h-5 w-5 flex-shrink-0 rotate-45" />
                        <div>
                            <p className="text-sm font-bold">Error adding key</p>
                            <p className="text-xs opacity-80 mt-1">{error}</p>
                        </div>
                    </div>
                )}

                {/* Info banner */}
                {!addedSuccessfully && (
                    <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start gap-3 text-indigo-700">
                        <Zap className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] font-medium leading-relaxed">
                            Keys are validated in the background after adding. You'll be notified of available models automatically.
                        </p>
                    </div>
                )}

                <div className="space-y-6">
                    {/* Provider Selection */}
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3 block">
                            SELECT PROVIDER
                        </Label>
                        <div className="grid grid-cols-3 gap-3">
                            {Object.entries(PROVIDER_CONFIG).map(([id, config]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => handleProviderChange(id as AIProviderId)}
                                    disabled={isSubmitting}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-300 group",
                                        provider === id
                                            ? "border-indigo-600 bg-indigo-50 shadow-sm ring-1 ring-indigo-600"
                                            : "border-slate-100 bg-slate-50/50 hover:border-indigo-200 hover:bg-slate-50 text-slate-500",
                                        "disabled:opacity-50 disabled:cursor-not-allowed"
                                    )}
                                >
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-transform group-hover:scale-110",
                                        id === 'openai' ? 'bg-emerald-100 text-emerald-700' :
                                            id === 'anthropic' ? 'bg-amber-100 text-amber-700' :
                                                'bg-indigo-100 text-indigo-700'
                                    )}>
                                        {config.icon}
                                    </div>
                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", provider === id ? "text-indigo-700" : "text-slate-500")}>
                                        {config.name}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2 block">
                                KEY LABEL
                            </Label>
                            <div className="relative group">
                                <Input
                                    value={label}
                                    onChange={(e) => handleLabelChange(e.target.value)}
                                    placeholder="Personal OpenAI Key"
                                    required
                                    disabled={isSubmitting}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={handleAutoGenerateLabel}
                                    disabled={key.length <= 4 || isSubmitting}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition p-1.5 hover:bg-slate-100 rounded-md disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                    title="Auto-generate label"
                                >
                                    <Wand2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2 block">
                                PRIORITY
                            </Label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                                disabled={isSubmitting}
                                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-all hover:border-indigo-200 disabled:opacity-50"
                            >
                                <option value="high">HIGH PRIORITY ⚡</option>
                                <option value="medium">MEDIUM PRIORITY</option>
                                <option value="low">LOW PRIORITY</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2 block">
                            <div className="flex justify-between items-center">
                                <span>API KEY SECRET</span>
                                {key.length > 0 && (
                                    <Badge variant={isValidFormat ? 'emerald' : 'amber'} size="sm">
                                        {isValidFormat ? 'Valid Format' : 'Invalid Format'}
                                    </Badge>
                                )}
                            </div>
                        </Label>
                        <div className="relative group">
                            <Input
                                type={showKey ? 'text' : 'password'}
                                value={key}
                                onChange={(e) => handleKeyChange(e.target.value)}
                                placeholder={PROVIDER_CONFIG[provider].placeholder}
                                className="font-mono pr-12"
                                required
                                error={key.length > 0 && !isValidFormat}
                                disabled={isSubmitting}
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1.5 hover:bg-slate-100 rounded-md"
                            >
                                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                            <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                                End-to-end Local Encryption
                            </p>
                        </div>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export const AddKeyForm = AddKeyModal;
