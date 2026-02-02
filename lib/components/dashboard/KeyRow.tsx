import React, { useState, useEffect } from 'react';
import { KeyMetadata, ModelCapability, VerifiedModelMetadata } from '../../models/types';
import {
    getModelCapabilities,
    filterModelsByCapability,
    getModelContextWindow
} from '../../services/model-capabilities';
import { getLLMKeyManagerConfig } from '../../config';
import { keyRouter } from '../../services';
import {
    RefreshCw,
    Edit2,
    Trash2,
    Key,
    CheckSquare,
    Square,
    Copy,
    Check,
    AlertCircle,
    Power,
    Loader2,
    ChevronDown,
    ChevronUp,
    Zap,
    Cpu,
    Eye,
    Code as CodeIcon,
    Terminal,
    Clock,
    Star
} from 'lucide-react';
import { Badge, Button, Progress } from '../ui';
import { cn } from '../../utils/cn';

interface KeyRowProps {
    keyData: KeyMetadata;
    selected: boolean;
    isDeleting: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onRefresh: () => void;
    onEdit: () => void;
    onToggleActive: () => void;
}

export const KeyRow: React.FC<KeyRowProps> = ({
    keyData,
    selected,
    isDeleting,
    onSelect,
    onDelete,
    onRefresh,
    onEdit,
    onToggleActive
}) => {
    const createdDate = new Date(keyData.createdAt);
    const [copied, setCopied] = useState(false);
    const isActive = keyData.isEnabled !== false;
    const isPrimary = keyRouter.getPromotedKey(keyData.providerId) === keyData.id;
    const [isRefreshing, setIsRefreshing] = useState(false);
    const hasModels = keyData.verifiedModels && keyData.verifiedModels.length > 0;

    const [isExpanded, setIsExpanded] = useState(false);
    const [cooldown, setCooldown] = useState<number | null>(null);
    const [modelStatuses, setModelStatuses] = useState<Record<string, VerifiedModelMetadata>>(() => {
        const initial: Record<string, VerifiedModelMetadata> = {};
        if (keyData.verifiedModelsMeta) {
            keyData.verifiedModelsMeta.forEach(m => initial[m.modelId] = m);
        }
        return initial;
    });

    // Update statuses when prop updates
    useEffect(() => {
        if (keyData.verifiedModelsMeta) {
            setModelStatuses(prev => {
                const next = { ...prev };
                keyData.verifiedModelsMeta!.forEach(m => next[m.modelId] = m);
                return next;
            });
        }
    }, [keyData.verifiedModelsMeta]);

    // Fetch detailed model statuses when expanded
    useEffect(() => {
        if (hasModels) {
            import('../../services/availability').then(({ availabilityManager }) => {
                availabilityManager.getModelsForKey(keyData.id).then(models => {
                    const statusMap: Record<string, VerifiedModelMetadata> = {};
                    models.forEach(m => statusMap[m.modelId] = m);
                    setModelStatuses(statusMap);
                });
            });
        }
    }, [hasModels, keyData.id]);

    // Cooldown timer logic
    useEffect(() => {
        if (!keyData.retryAfter) {
            setCooldown(null);
            return;
        }

        const tick = () => {
            const now = Date.now();
            const diff = Math.ceil((keyData.retryAfter! - now) / 1000);
            if (diff <= 0) {
                setCooldown(null);
            } else {
                setCooldown(diff);
            }
        };

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [keyData.retryAfter]);

    // Global 'now' for all model-level timers
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // Get config for default filter
    const config = getLLMKeyManagerConfig();
    const [capabilityFilter, setCapabilityFilter] = useState<ModelCapability | 'all'>(
        config.defaultCapabilityFilter || 'all'
    );

    const handleCopyId = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(keyData.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRefresh = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setIsRefreshing(false);
        }
    };

    const getPriorityBadgeVariant = (p?: string) => {
        switch (p) {
            case 'high': return 'red';
            case 'low': return 'slate';
            default: return 'indigo';
        }
    };

    const getProviderBadgeVariant = (provider: string) => {
        const p = provider.toLowerCase();
        if (p.includes('openai')) return 'emerald';
        if (p.includes('anthropic')) return 'amber';
        if (p.includes('gemini') || p.includes('google')) return 'indigo';
        return 'slate';
    };

    return (
        <div
            className={cn(
                "group relative bg-white transition-all duration-300",
                isExpanded ? "shadow-md rounded-xl z-10 border border-indigo-100 my-4" : "hover:bg-slate-50/50 border-b border-gray-100 first:rounded-t-lg last:rounded-b-lg last:border-0",
                keyData.isRevoked && "opacity-60 bg-gray-50",
                !isActive && !keyData.isRevoked && "opacity-75 bg-slate-50/30",
                isDeleting && "opacity-50 pointer-events-none scale-[0.98]",
                selected && "bg-indigo-50/40 hover:bg-indigo-50/60"
            )}
        >
            {/* Main Row */}
            <div className="flex items-center gap-4 px-5 py-4">
                {/* Checkbox */}
                <button
                    onClick={onSelect}
                    className={cn(
                        "transition-colors p-1 rounded-md",
                        selected ? "text-indigo-600" : "text-gray-300 hover:text-gray-500"
                    )}
                >
                    {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                </button>

                {/* Key Info */}
                <div className="w-56 min-w-0 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant={getProviderBadgeVariant(keyData.providerId)} size="sm">
                            {keyData.providerId}
                        </Badge>
                        {isPrimary && (
                            <Badge variant="amber" size="sm" className="bg-amber-50 text-amber-700 border-amber-200 animate-pulse">
                                <Star className="h-2.5 w-2.5 mr-1 fill-amber-400" />
                                PRIMARY
                            </Badge>
                        )}
                        {keyData.tier && (
                            <Badge variant="slate" size="sm" className="bg-slate-100 text-slate-600 border-slate-200">
                                {keyData.tier.toUpperCase()}
                            </Badge>
                        )}
                        <Badge variant={getPriorityBadgeVariant(keyData.priority)} size="sm">
                            {keyData.priority || 'medium'}
                        </Badge>
                        {keyData.isRevoked && (
                            <span title="Revoked" className="text-red-500">
                                <AlertCircle className="h-3.5 w-3.5" />
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 group-hover:translate-x-0.5 transition-transform duration-300">
                        <Key className={cn("h-3.5 w-3.5", isActive ? "text-indigo-400" : "text-slate-300")} />
                        <p className={cn("font-bold text-sm truncate max-w-[160px] tracking-tight", isActive ? "text-slate-700" : "text-slate-400 line-through")}>
                            {keyData.label}
                        </p>
                    </div>
                </div>

                {/* Status & Quota Column */}
                <div className="flex-1 min-w-0 flex items-center justify-start gap-6">
                    <div className="flex flex-col gap-1 min-w-[120px]">
                        {cooldown ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                                <Clock className="h-3 w-3 animate-pulse" />
                                Ready in {cooldown}s
                            </div>
                        ) : keyData.verificationStatus === 'invalid' ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider border border-red-100">
                                <AlertCircle className="h-3 w-3" />
                                Invalid
                            </div>
                        ) : keyData.verificationStatus === 'retry_scheduled' ? (
                            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                                <Clock className="h-3 w-3 animate-pulse" />
                                Retrying...
                            </div>
                        ) : keyData.verificationStatus === 'testing' || isRefreshing ? (
                            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Verifying...
                            </div>
                        ) : hasModels ? (
                            <div className="flex flex-col items-start gap-1">
                                {(() => {
                                    const availableCount = Object.values(modelStatuses).filter(m => m.state === 'AVAILABLE').length;
                                    const totalModels = keyData.verifiedModels?.length || 0;

                                    return (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setIsExpanded(!isExpanded);
                                                }
                                            }}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                                                isExpanded
                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                    : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
                                            )}
                                            aria-expanded={isExpanded}
                                            aria-controls={`models-${keyData.id}`}
                                        >
                                            <span className="relative flex h-2 w-2">
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            {availableCount} Available
                                            <span className="opacity-20 mx-1">/</span>
                                            <span>{totalModels} Models</span>
                                            {isExpanded ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                                        </button>
                                    );
                                })()}
                                {keyData.averageLatency ? (
                                    <span className="text-[10px] font-bold text-slate-400 ml-2">
                                        ⚡ {keyData.averageLatency}ms AVG
                                    </span>
                                ) : null}
                            </div>
                        ) : (
                            <button
                                onClick={handleRefresh}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100 hover:bg-amber-100 transition-colors"
                            >
                                <AlertCircle className="h-3 w-3" />
                                Untested
                            </button>
                        )}
                    </div>

                    {/* Real-time Usage Bars */}
                    {hasModels && keyData.rateLimits && (
                        <div className="hidden lg:flex flex-col gap-2 w-48">
                            {keyData.rateLimits.requests && (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                                        <span>Requests</span>
                                        <span>{keyData.rateLimits.requests.remaining} / {keyData.rateLimits.requests.limit}</span>
                                    </div>
                                    <Progress
                                        value={(keyData.rateLimits.requests.remaining / keyData.rateLimits.requests.limit) * 100}
                                        className="h-1 bg-slate-100"
                                        indicatorClassName={keyData.rateLimits.requests.remaining < 5 ? "bg-red-500" : "bg-indigo-500"}
                                    />
                                </div>
                            )}
                            {keyData.rateLimits.tokens && (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                                        <span>Tokens</span>
                                        <span>{Math.round(keyData.rateLimits.tokens.remaining / 1000)}k / {Math.round(keyData.rateLimits.tokens.limit / 1000)}k</span>
                                    </div>
                                    <Progress
                                        value={(keyData.rateLimits.tokens.remaining / keyData.rateLimits.tokens.limit) * 100}
                                        className="h-1 bg-slate-100"
                                        indicatorClassName="bg-emerald-500"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Date */}
                <div className="text-right w-24 flex-shrink-0 hidden sm:block">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Added</p>
                    <p className="text-xs text-slate-500 font-semibold">
                        {createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
                            className={cn("h-8 w-8 rounded-none border-r border-slate-100", isActive ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50')}
                            title={isActive ? 'Deactivate' : 'Activate'}
                        >
                            <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className={cn("h-8 w-8 rounded-none", isRefreshing ? 'animate-spin' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50')}
                            title="Validate"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    <div className="flex gap-1 ml-2">
                        <Button variant="ghost" size="icon" onClick={handleCopyId} className="h-8 w-8 text-slate-400" title="Copy ID">
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="h-8 w-8 text-slate-400" title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Expandable Models Section */}
            {isExpanded && hasModels && (
                <div className="px-5 pb-5 pt-0 animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                Verified Models
                                <Badge variant="slate" size="sm" className="bg-white">
                                    {capabilityFilter === 'all'
                                        ? keyData.verifiedModels!.length
                                        : filterModelsByCapability(keyData.verifiedModels!, capabilityFilter).length}
                                </Badge>
                            </h4>
                            <select
                                value={capabilityFilter}
                                onChange={(e) => setCapabilityFilter(e.target.value as ModelCapability | 'all')}
                                className="text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-600 cursor-pointer hover:border-indigo-200 transition-all font-mono"
                            >
                                <option value="all">ALL CAPABILITIES</option>
                                <option value="text-chat">💬 CHAT</option>
                                <option value="text-reasoning">🧠 REASONING</option>
                                <option value="code">💻 CODE</option>
                                <option value="image-input">🖼️ VISION</option>
                                <option value="image-gen">🎨 IMAGE GEN</option>
                                <option value="embedding">📊 EMBEDDING</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                            {(capabilityFilter === 'all'
                                ? keyData.verifiedModels!
                                : filterModelsByCapability(keyData.verifiedModels!, capabilityFilter)
                            ).map(model => {
                                const capabilities = getModelCapabilities(model);
                                return (
                                    <div
                                        key={model}
                                        className="flex flex-col gap-2 bg-white p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all animate-in fade-in zoom-in-95 duration-200"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-slate-700 font-bold truncate pr-2" title={model}>
                                                {model}
                                            </span>
                                            <div className="flex gap-1.5">
                                                {capabilities.includes('text-chat') && <span title="Text Chat"><Terminal className="h-3 w-3 text-slate-400" /></span>}
                                                {capabilities.includes('text-reasoning') && <span title="Reasoning"><Cpu className="h-3 w-3 text-indigo-400" /></span>}
                                                {capabilities.includes('code') && <span title="Code"><CodeIcon className="h-3 w-3 text-emerald-400" /></span>}
                                                {capabilities.includes('image-input') && <span title="Vision"><Eye className="h-3 w-3 text-amber-400" /></span>}
                                                {capabilities.includes('image-gen') && <span title="Image Gen"><Zap className="h-3 w-3 text-purple-400" /></span>}
                                            </div>
                                        </div>

                                        <div className="w-full">
                                            {(() => {
                                                const status = modelStatuses[model];
                                                const isCooldown = status?.state === 'COOLDOWN';
                                                const isFailed = status?.state === 'PERM_FAILED';
                                                const isChecking = status?.state === 'CHECKING' || status?.state === 'NEW';

                                                let barColor = "bg-slate-200";
                                                let statusText = "Pending...";

                                                if (status?.state === 'AVAILABLE') {
                                                    barColor = "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]";
                                                    statusText = "Ready";
                                                } else if (isCooldown) {
                                                    barColor = "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
                                                    statusText = `Cooldown (Retry ${status?.retryCount ?? 0})`;
                                                } else if (isFailed) {
                                                    barColor = "bg-red-500";
                                                    statusText = `Failed (Reached Max Retries)`;
                                                } else if (isChecking) {
                                                    barColor = "bg-indigo-400 animate-pulse";
                                                    statusText = "Checking";
                                                }

                                                const nextRetryMs = status?.nextRetryAt ? status.nextRetryAt - now : 0;
                                                const retrySoon = nextRetryMs > 0 && nextRetryMs < 3600000;
                                                let retryTimeStr = '';

                                                if (retrySoon) {
                                                    if (nextRetryMs < 60000) {
                                                        retryTimeStr = `${Math.ceil(nextRetryMs / 1000)}S`;
                                                    } else {
                                                        retryTimeStr = `${Math.ceil(nextRetryMs / 60000)}M`;
                                                    }
                                                }

                                                return (
                                                    <>
                                                        <Progress
                                                            value={100}
                                                            className="h-1 bg-slate-50"
                                                            indicatorClassName={isActive ? barColor : "bg-slate-200"}
                                                        />
                                                        <div className="flex justify-between items-center mt-1.5">
                                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                <p className={cn("text-[8px] font-bold uppercase truncate", isCooldown ? "text-amber-500" : isFailed ? "text-red-500" : "text-slate-400")}>
                                                                    {statusText}
                                                                </p>
                                                                {isCooldown && retryTimeStr && (
                                                                    <span className="text-[7px] bg-amber-50 text-amber-600 px-1 py-0.5 rounded border border-amber-100/50 font-bold">
                                                                        {retryTimeStr}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[8px] bg-slate-50 text-slate-400 px-1 rounded font-mono">
                                                                {getModelContextWindow(model)}
                                                            </span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
