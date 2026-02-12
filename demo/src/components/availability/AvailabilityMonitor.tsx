import { useEffect, useState } from 'react';
import { useAvailability, useLLMKeyManager, VerifiedModelMetadata, ModelState, KeyMetadata } from '../../../../lib';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

export const AvailabilityMonitor = () => {
    const {
        stats,
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
                return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase border border-emerald-500/20"><CheckCircle size={10} /> Available</span>;
            case 'TEMP_FAILED':
                return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase border border-amber-500/20"><AlertTriangle size={10} /> Retrying</span>;
            case 'COOLDOWN':
                return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase border border-orange-500/20"><Clock size={10} /> Cooldown</span>;
            case 'PERM_FAILED':
                return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-[10px] font-black uppercase border border-red-500/20"><XCircle size={10} /> Failed</span>;
            case 'CHECKING':
                return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase border border-indigo-500/20"><RefreshCw size={10} className="animate-spin" /> Verifying</span>;
            case 'NEW':
            default:
                return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800 text-slate-400 text-[10px] font-black uppercase border border-slate-700">New</span>;
        }
    };

    return (
        <div className="bg-slate-900 rounded-3xl shadow-2xl shadow-black/40 border border-slate-800 overflow-hidden group hover:border-indigo-500/30 transition-all duration-500">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
                <h3 className="text-xs font-black text-slate-200 flex items-center gap-3 uppercase tracking-wider">
                    <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                        <RefreshCw size={14} className="text-indigo-400" />
                    </div>
                    Availability Matrix
                </h3>
                <div className="flex gap-2">
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Feed
                    </div>
                </div>
            </div>

            <div className="p-4 grid grid-cols-4 gap-3 bg-slate-950/20 border-b border-slate-800/50">
                <div className="bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50 text-center">
                    <div className="text-xl font-black text-slate-300">{stats.total}</div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Total</div>
                </div>
                <div className="bg-emerald-500/5 p-3 rounded-2xl border border-emerald-500/10 text-center">
                    <div className="text-xl font-black text-emerald-400">{stats.available}</div>
                    <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest mt-0.5">Online</div>
                </div>
                <div className="bg-amber-500/5 p-3 rounded-2xl border border-amber-500/10 text-center">
                    <div className="text-xl font-black text-amber-400">{stats.temporaryFailed}</div>
                    <div className="text-[9px] text-amber-600 font-bold uppercase tracking-widest mt-0.5">Retry</div>
                </div>
                <div className="bg-red-500/5 p-3 rounded-2xl border border-red-500/10 text-center">
                    <div className="text-xl font-black text-red-400">{stats.permanentFailed}</div>
                    <div className="text-[9px] text-red-600 font-bold uppercase tracking-widest mt-0.5">Off</div>
                </div>
            </div>

            <div className="grid grid-cols-3 h-[450px]">
                {/* Key List */}
                <div className="border-r border-slate-800 overflow-y-auto bg-slate-950/30">
                    <div className="px-4 py-3 bg-slate-800/20 border-b border-slate-800/50 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        Endpoints
                    </div>
                    {keys.length === 0 ? (
                        <div className="p-6 text-center text-slate-600 text-xs italic">No keys found</div>
                    ) : (
                        keys.map((key: KeyMetadata) => (
                            <div
                                key={key.id}
                                onClick={() => setSelectedKey(key.id)}
                                className={clsx(
                                    "p-4 border-b border-slate-800/50 cursor-pointer transition-all relative group/key",
                                    selectedKey === key.id
                                        ? "bg-slate-800/80 border-l-4 border-l-indigo-500 shadow-inner"
                                        : "hover:bg-slate-800/40"
                                )}
                            >
                                <div className="font-bold text-slate-200 text-xs truncate mb-1.5">{key.label}</div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-black text-slate-500 bg-slate-900 border border-slate-700/50 px-2 py-0.5 rounded-md uppercase tracking-widest group-hover/key:text-indigo-400 transition-colors">
                                        {key.providerId}
                                    </span>
                                    {key.verificationStatus === 'valid' ? (
                                        <CheckCircle size={12} className="text-emerald-500 shadow-emerald-500/20" />
                                    ) : (
                                        <AlertTriangle size={12} className="text-amber-500" />
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Model Details */}
                <div className="col-span-2 overflow-y-auto bg-slate-900/50">
                    {selectedKey ? (
                        <div className="animate-in fade-in duration-300">
                            <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Model Cluster Availability</h4>
                                <span className="text-[10px] font-bold text-slate-600">
                                    {modelDetails.length} OBJECTS
                                </span>
                            </div>

                            {loadingDetails ? (
                                <div className="p-12 flex flex-col items-center gap-4 text-slate-600">
                                    <RefreshCw className="animate-spin w-8 h-8 opacity-40" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Interrogating models...</span>
                                </div>
                            ) : modelDetails.length === 0 ? (
                                <div className="p-12 text-center text-slate-600 text-sm italic">
                                    No model data available for this key.
                                </div>
                            ) : (
                                <div className="p-4 space-y-3">
                                    {modelDetails.map(model => (
                                        <div key={model.modelId} className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-colors group/model shadow-lg shadow-black/10">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <div className="font-mono font-bold text-indigo-300 text-xs mb-1.5">{model.modelId}</div>
                                                    <div className="flex items-center gap-3">
                                                        <StateBadge state={model.state} />
                                                        <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1" title="Priority">
                                                            P{model.modelPriority}
                                                        </span>
                                                        {model.retryCount > 0 && (
                                                            <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                                ATTEMPT {model.retryCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        retryModel(model.keyId, model.modelId);
                                                    }}
                                                    className="text-[10px] font-black uppercase tracking-widest bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-all border border-slate-600 hover:border-indigo-400/50 shadow-lg shadow-black/20"
                                                >
                                                    Probe Now
                                                </button>
                                            </div>

                                            {/* Details section */}
                                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700/30">
                                                <div className="">
                                                    <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Next Verification</span>
                                                    {model.nextRetryAt ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="flex items-center gap-2 text-[10px] font-bold text-slate-300 font-mono">
                                                                <Clock size={12} className="text-slate-500" />
                                                                {new Date(model.nextRetryAt).toLocaleTimeString()}
                                                            </span>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="h-1 flex-1 bg-slate-700 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-indigo-500/40 animate-pulse w-1/3" />
                                                                </div>
                                                                <span className="text-[9px] text-amber-400 font-black bg-amber-400/10 px-1.5 py-0.5 rounded uppercase border border-amber-400/20">
                                                                    T-{(() => {
                                                                        const diff = Math.ceil((model.nextRetryAt - now) / 1000);
                                                                        if (diff <= 0) return 'NOW';
                                                                        if (diff < 60) return `${diff}S`;
                                                                        return `${Math.ceil(diff / 60)}M`;
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-700 text-[10px] font-mono">---</span>
                                                    )}
                                                </div>
                                                <div className="">
                                                    <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Observation Log</span>
                                                    <span className="text-[10px] font-bold text-slate-400 font-mono flex items-center gap-2">
                                                        {model.lastCheckedAt ? (
                                                            <>
                                                                <CheckCircle size={12} className="text-slate-600" />
                                                                {new Date(model.lastCheckedAt).toLocaleTimeString()}
                                                            </>
                                                        ) : 'NO_DATA'}
                                                    </span>
                                                </div>
                                            </div>

                                            {model.errorMessage && (
                                                <div className="mt-4 bg-red-500/5 text-red-400 text-[10px] font-medium p-3 rounded-xl border border-red-500/10 font-mono flex gap-2">
                                                    <AlertTriangle size={14} className="flex-shrink-0" />
                                                    {model.errorMessage}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 p-12 text-center">
                            <div className="p-6 bg-slate-800/30 rounded-full mb-6 border border-slate-800 animate-pulse">
                                <VerifiedModelMetadataIcon className="w-16 h-16 opacity-10" />
                            </div>
                            <h5 className="text-xs font-black uppercase tracking-[0.2em] mb-2">No Active Probe</h5>
                            <p className="text-[10px] max-w-[200px] leading-relaxed opacity-50">Securely select an encryption key from the left to inspect real-time model telemetry.</p>
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
