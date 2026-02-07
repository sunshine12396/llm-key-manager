import { useEffect, useState } from 'react';
import { useAvailability, useLLMKeyManager } from '../../../../lib';
import { VerifiedModelMetadata, ModelState } from '../../../../lib/models/types';
import { KeyMetadata } from '../../../../lib/models/metadata';
import { RefreshCw, Play, Square, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

export const AvailabilityMonitor = () => {
    const { 
        stats, 
        refreshStats, 
        getKeyModelDetails,
        retryModel 
    } = useAvailability();
    
    // Use reactive hook for keys
    const { keys } = useLLMKeyManager();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [modelDetails, setModelDetails] = useState<VerifiedModelMetadata[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [now, setNow] = useState(Date.now());

    // Update current time every second for countdowns
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // Refresh details when selected key changes or stats refresh
    useEffect(() => {
        if (selectedKey) {
            setLoadingDetails(true);
            getKeyModelDetails(selectedKey)
                .then(setModelDetails)
                .finally(() => setLoadingDetails(false));
        } else {
            setModelDetails([]);
        }
    }, [selectedKey, stats]); // Refresh when stats change too

    if (!stats) return <div className="p-4">Loading availability stats...</div>;

    const StateBadge = ({ state }: { state: ModelState }) => {
        switch (state) {
            case 'AVAILABLE':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-medium"><CheckCircle size={12} /> Available</span>;
            case 'TEMP_FAILED':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-xs font-medium"><AlertTriangle size={12} /> Temp. Fail</span>;
            case 'COOLDOWN':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-orange-100 text-orange-700 text-xs font-medium"><Clock size={12} /> Cooldown</span>;
            case 'PERM_FAILED':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-medium"><XCircle size={12} /> Perm. Fail</span>;
            case 'CHECKING':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium"><RefreshCw size={12} className="animate-spin" /> Checking</span>;
            case 'NEW':
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs font-medium">New</span>;
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <span className="text-xl">📡</span> Availability Monitor
                </h3>
                <div className="flex gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest border border-indigo-100/50">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        Auto-Monitoring Active
                    </div>
                    <button 
                        onClick={() => refreshStats()}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                        title="Refresh Stats"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className="p-4 grid grid-cols-4 gap-4 border-b border-gray-100">
                <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-700">{stats.total}</div>
                    <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">Total Models</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-700">{stats.available}</div>
                    <div className="text-xs text-green-600 font-medium uppercase tracking-wide">Available</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-700">{stats.temporaryFailed}</div>
                    <div className="text-xs text-yellow-600 font-medium uppercase tracking-wide">Retrying</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-700">{stats.permanentFailed}</div>
                    <div className="text-xs text-red-600 font-medium uppercase tracking-wide">Failed</div>
                </div>
            </div>

            <div className="grid grid-cols-3 h-[400px]">
                {/* Key List */}
                <div className="border-r border-gray-100 overflow-y-auto">
                    <div className="p-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
                        Select Key to Inspect
                    </div>
                    {keys.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm">No keys found</div>
                    ) : (
                        keys.map((key: KeyMetadata) => (
                            <div 
                                key={key.id}
                                onClick={() => setSelectedKey(key.id)}
                                className={clsx(
                                    "p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors",
                                    selectedKey === key.id && "bg-blue-50 border-l-4 border-l-blue-500"
                                )}
                            >
                                <div className="font-medium text-gray-900 text-sm truncate">{key.label}</div>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded capitalize">
                                        {key.providerId}
                                    </span>
                                    {key.verificationStatus === 'valid' ? (
                                        <CheckCircle size={12} className="text-green-500" />
                                    ) : (
                                        <AlertTriangle size={12} className="text-yellow-500" />
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Model Details */}
                <div className="col-span-2 overflow-y-auto bg-gray-50">
                    {selectedKey ? (
                        <div>
                            <div className="p-3 bg-white border-b border-gray-100 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                                <h4 className="font-medium text-gray-900">Model Availability</h4>
                                <span className="text-xs text-gray-400">
                                    {modelDetails.length} models tracked
                                </span>
                            </div>
                            
                            {loadingDetails ? (
                                <div className="p-8 flex justify-center text-gray-400">
                                    <RefreshCw className="animate-spin" />
                                </div>
                            ) : modelDetails.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">
                                    No models tracked for this key yet.
                                </div>
                            ) : (
                                <div className="p-4 space-y-3">
                                    {modelDetails.map(model => (
                                        <div key={model.modelId} className="bg-white p-3 rounded border border-gray-200 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-medium text-gray-900 text-sm">{model.modelId}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <StateBadge state={model.state} />
                                                        <span className="text-xs text-gray-400 flex items-center gap-1" title="Priority">
                                                            P{model.modelPriority}
                                                        </span>
                                                        {model.retryCount > 0 && (
                                                            <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                                                                Retry #{model.retryCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        retryModel(model.keyId, model.modelId);
                                                    }}
                                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded transition-colors"
                                                >
                                                    Retry Now
                                                </button>
                                            </div>
                                            
                                            {/* Details section */}
                                            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-50 text-xs">
                                                <div className="text-gray-500">
                                                    <span className="block text-gray-400 mb-0.5">Next Check</span>
                                                    {model.nextRetryAt ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="flex items-center gap-1 text-orange-600">
                                                                <Clock size={10} />
                                                                {new Date(model.nextRetryAt).toLocaleTimeString()}
                                                            </span>
                                                            <span className="text-[10px] text-orange-500 font-bold bg-orange-50 px-1 rounded-sm w-fit">
                                                                In {(() => {
                                                                    const diff = Math.ceil((model.nextRetryAt - now) / 1000);
                                                                    if (diff <= 0) return 'now';
                                                                    if (diff < 60) return `${diff}s`;
                                                                    return `${Math.ceil(diff / 60)}m`;
                                                                })()}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-300">-</span>
                                                    )}
                                                </div>
                                                <div className="text-gray-500">
                                                    <span className="block text-gray-400 mb-0.5">Last Check</span>
                                                    {model.lastCheckedAt ? new Date(model.lastCheckedAt).toLocaleTimeString() : 'Never'}
                                                </div>
                                            </div>
                                            
                                            {model.errorMessage && (
                                                <div className="mt-2 bg-red-50 text-red-700 text-xs p-2 rounded">
                                                    {model.errorMessage}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                            <VerifiedModelMetadataIcon className="w-12 h-12 mb-2 opacity-20" />
                            <p>Select a key to view model availability details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Simple icon placeholder since I don't want to import too many
const VerifiedModelMetadataIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
);
