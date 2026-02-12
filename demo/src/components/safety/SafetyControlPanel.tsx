import { useSafetyGuard, useLLMKeyManager } from '../../../../lib';
import type { AIProviderId } from '../../../../lib/models/types';
import {
    Shield,
    ShieldOff,
    AlertTriangle,
    Power,
    PowerOff,
    Snowflake,
    RefreshCw,
    Activity
} from 'lucide-react';
import clsx from 'clsx';

export const SafetyControlPanel = () => {
    const {
        status,
        lastEvent,
        disableProvider,
        enableProvider,
        freezeScanning,
        resumeScanning,
        enableEmergencyMode,
        disableEmergencyMode,
        disableKey,
        enableKey,
        resetKeyCircuit,
        resetProviderCircuit,
        resetAll
    } = useSafetyGuard();

    const { keys } = useLLMKeyManager();

    if (!status) return <div className="p-4">Loading safety status...</div>;

    // Only include valid AIProviderId values
    const providers: AIProviderId[] = ['openai', 'anthropic', 'gemini'];

    return (
        <div className="bg-slate-900 rounded-3xl shadow-2xl shadow-black/40 border border-slate-800 overflow-hidden group hover:border-red-500/30 transition-all duration-500">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-red-500/5 backdrop-blur-md">
                <h3 className="text-xs font-black text-slate-200 flex items-center gap-3 uppercase tracking-wider">
                    <div className="p-1.5 bg-red-500/10 rounded-lg">
                        <Shield className="text-red-500" size={14} />
                    </div>
                    Defensive Perimeter
                </h3>
                <button
                    onClick={resetAll}
                    className="text-[10px] font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-all flex items-center gap-1.5"
                >
                    <RefreshCw size={12} /> Reset System
                </button>
            </div>

            {/* Emergency Mode Banner */}
            {status.emergencyMode && (
                <div className="bg-red-600 text-white p-4 flex items-center justify-between animate-pulse shadow-lg shadow-red-500/20">
                    <span className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em]">
                        <AlertTriangle size={18} className="animate-bounce" />
                        Extreme Safeguard Active
                    </span>
                    <button
                        onClick={disableEmergencyMode}
                        className="bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-xl border border-white/20 text-[10px] font-black uppercase tracking-widest backdrop-blur-md"
                    >
                        Override
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-slate-950/20">
                {/* Global Controls */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[.2em] px-1">Global Overrides</h4>

                    {/* Scanning Control */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-800 shadow-inner group/item">
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "p-2 rounded-lg transition-colors",
                                status.scanningFrozen ? "bg-blue-500/10" : "bg-emerald-500/10"
                            )}>
                                {status.scanningFrozen ? (
                                    <Snowflake size={16} className="text-blue-400" />
                                ) : (
                                    <Activity size={16} className="text-emerald-400" />
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-200">Watchdog</span>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{status.scanningFrozen ? 'Halted' : 'Active'}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => status.scanningFrozen ? resumeScanning() : freezeScanning('Manual freeze')}
                            className={clsx(
                                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg",
                                status.scanningFrozen
                                    ? "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 shadow-emerald-500/10"
                                    : "bg-blue-600 text-white border-blue-500 hover:bg-blue-500 shadow-blue-500/10"
                            )}
                        >
                            {status.scanningFrozen ? 'Resume' : 'Freeze'}
                        </button>
                    </div>

                    {/* Emergency Mode Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-slate-800 shadow-inner">
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "p-2 rounded-lg transition-colors",
                                status.emergencyMode ? "bg-red-600" : "bg-red-500/10"
                            )}>
                                <AlertTriangle size={16} className={status.emergencyMode ? "text-white" : "text-red-500"} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-200">Safeguard</span>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{status.emergencyMode ? 'Armed' : 'Disarmed'}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => status.emergencyMode ? disableEmergencyMode() : enableEmergencyMode('Manual trigger')}
                            className={clsx(
                                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg",
                                status.emergencyMode
                                    ? "bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/10"
                                    : "bg-red-600 text-white border-red-500 shadow-red-500/10 hover:bg-red-500"
                            )}
                        >
                            {status.emergencyMode ? 'Disable' : 'Enable'}
                        </button>
                    </div>
                </div>

                {/* Provider Controls */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[.2em] px-1">Network Isolation</h4>

                    <div className="space-y-2">
                        {providers.map(provider => {
                            const isDisabled = status.disabledProviders.includes(provider);
                            const circuitState = status.providerCircuits[provider];

                            return (
                                <div key={provider} className="flex items-center justify-between p-3.5 bg-slate-800/40 rounded-2xl border border-slate-800 shadow-inner group/prov">
                                    <div className="flex items-center gap-3">
                                        <div className={clsx(
                                            "p-1.5 rounded-md border transition-all",
                                            isDisabled ? "bg-red-500/10 border-red-500/20 text-red-500" :
                                                circuitState === 'OPEN' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
                                                    "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                        )}>
                                            {isDisabled ? (
                                                <PowerOff size={14} />
                                            ) : circuitState === 'OPEN' ? (
                                                <ShieldOff size={14} />
                                            ) : (
                                                <Power size={14} />
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-200 capitalize">{provider}</span>
                                            {circuitState && circuitState !== 'CLOSED' && (
                                                <span className={clsx(
                                                    "text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase border mt-0.5",
                                                    circuitState === 'OPEN' && "bg-red-600 text-white border-red-500",
                                                    circuitState === 'HALF_OPEN' && "bg-amber-500 text-slate-900 border-amber-400"
                                                )}>
                                                    {circuitState}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {circuitState && circuitState !== 'CLOSED' && (
                                            <button
                                                onClick={() => resetProviderCircuit(provider)}
                                                className="p-1.5 bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg transition-all border border-slate-600"
                                                title="Reset Circuit"
                                            >
                                                <RefreshCw size={12} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => isDisabled ? enableProvider(provider) : disableProvider(provider, 'Manual disable')}
                                            className={clsx(
                                                "px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border shadow-md",
                                                isDisabled
                                                    ? "bg-emerald-600 text-white border-emerald-500"
                                                    : "bg-red-600/20 text-red-400 border-red-500/20 hover:bg-red-600 hover:text-white"
                                            )}
                                        >
                                            {isDisabled ? 'Restore' : 'Cut'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Keys Section */}
            <div className="border-t border-slate-800 p-5 bg-slate-900/50">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[.2em] px-1">Segmented Vault Keys</h4>
                    <span className="text-[9px] font-bold text-slate-700 font-mono tracking-widest">{keys.length} ENTRIES</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {keys.map(key => {
                        const isDisabled = status.disabledKeys.includes(key.id);
                        const circuitState = status.keyCircuits[key.id];

                        return (
                            <div
                                key={key.id}
                                className={clsx(
                                    "p-3 rounded-2xl transition-all border group/key shadow-lg",
                                    isDisabled
                                        ? "bg-red-500/5 border-red-500/20"
                                        : circuitState === 'OPEN'
                                            ? "bg-amber-500/5 border-amber-500/20"
                                            : "bg-slate-800/50 border-slate-800 hover:border-slate-700"
                                )}
                            >
                                <div className="font-bold text-slate-200 text-[11px] truncate mb-2">{key.label}</div>
                                <div className="flex items-center justify-between">
                                    <span className={clsx(
                                        "text-[9px] font-black uppercase tracking-widest font-mono",
                                        isDisabled && "text-red-500",
                                        circuitState === 'OPEN' && !isDisabled && "text-amber-500",
                                        !isDisabled && circuitState !== 'OPEN' && "text-slate-500"
                                    )}>
                                        {isDisabled ? 'SHUTDOWN' : circuitState || 'SECURE'}
                                    </span>
                                    <div className="flex gap-2">
                                        {circuitState && circuitState !== 'CLOSED' && (
                                            <button
                                                onClick={() => resetKeyCircuit(key.id)}
                                                className="text-slate-400 hover:text-indigo-400 transition-colors"
                                                title="Reset Key Circuit"
                                            >
                                                <RefreshCw size={12} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => isDisabled ? enableKey(key.id) : disableKey(key.id, 'Manual disable')}
                                            className={clsx(
                                                "transition-colors",
                                                isDisabled ? "text-emerald-500 hover:text-emerald-400" : "text-slate-600 hover:text-red-500"
                                            )}
                                        >
                                            {isDisabled ? <Power size={12} /> : <PowerOff size={12} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Last Event */}
            {lastEvent && (
                <div className="border-t border-slate-800 p-3 bg-slate-950 flex items-center justify-between group-hover:bg-slate-900 transition-colors">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Global Telemetry Trace</span>
                    <span className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-indigo-500 animate-ping" />
                        <code className="text-[9px] font-mono text-indigo-400 font-bold bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">[{lastEvent.type}]</code>
                    </span>
                </div>
            )}
        </div>
    );
};
