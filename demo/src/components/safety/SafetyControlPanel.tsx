import { useState } from 'react';
import { useSafetyGuard, useLLMKeyManager } from '../../../../lib';
import type { AIProviderId } from '../../../../lib/models/types';
import { 
    Shield, 
    ShieldOff, 
    AlertTriangle, 
    Power, 
    PowerOff, 
    Snowflake, 
    Target, 
    X, 
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
        setForcedFallback,
        clearForcedFallback,
        enableEmergencyMode,
        disableEmergencyMode,
        disableKey,
        enableKey,
        resetKeyCircuit,
        resetProviderCircuit,
        resetAll
    } = useSafetyGuard();

    const { keys } = useLLMKeyManager();
    const [fallbackModel, setFallbackModel] = useState('');

    if (!status) return <div className="p-4">Loading safety status...</div>;

    // Only include valid AIProviderId values
    const providers: AIProviderId[] = ['openai', 'anthropic', 'gemini'];

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-red-50 to-white">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Shield className="text-red-600" size={20} />
                    Safety Control Panel
                </h3>
                <button
                    onClick={resetAll}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                >
                    <RefreshCw size={12} /> Reset All
                </button>
            </div>

            {/* Emergency Mode Banner */}
            {status.emergencyMode && (
                <div className="bg-red-600 text-white p-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                        <AlertTriangle size={18} />
                        🚨 EMERGENCY MODE ACTIVE
                    </span>
                    <button
                        onClick={disableEmergencyMode}
                        className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-sm"
                    >
                        Disable
                    </button>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 p-4">
                {/* Global Controls */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Global Controls</h4>
                    
                    {/* Scanning Control */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                            {status.scanningFrozen ? (
                                <Snowflake size={16} className="text-blue-500" />
                            ) : (
                                <Activity size={16} className="text-green-500" />
                            )}
                            <span className="text-sm font-medium">Background Scanning</span>
                        </div>
                        <button
                            onClick={() => status.scanningFrozen ? resumeScanning() : freezeScanning('Manual freeze')}
                            className={clsx(
                                "px-3 py-1 rounded text-xs font-medium transition-colors",
                                status.scanningFrozen
                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            )}
                        >
                            {status.scanningFrozen ? 'Resume' : 'Freeze'}
                        </button>
                    </div>

                    {/* Emergency Mode */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className={status.emergencyMode ? "text-red-500" : "text-gray-400"} />
                            <span className="text-sm font-medium">Emergency Mode</span>
                        </div>
                        <button
                            onClick={() => status.emergencyMode ? disableEmergencyMode() : enableEmergencyMode('Manual trigger')}
                            className={clsx(
                                "px-3 py-1 rounded text-xs font-medium transition-colors",
                                status.emergencyMode
                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                    : "bg-red-100 text-red-700 hover:bg-red-200"
                            )}
                        >
                            {status.emergencyMode ? 'Disable' : 'Enable'}
                        </button>
                    </div>

                    {/* Forced Fallback */}
                    <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                            <Target size={16} className={status.forcedFallback ? "text-orange-500" : "text-gray-400"} />
                            <span className="text-sm font-medium">Forced Fallback</span>
                        </div>
                        {status.forcedFallback ? (
                            <div className="flex items-center justify-between">
                                <code className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                                    {status.forcedFallback.model}
                                </code>
                                <button
                                    onClick={clearForcedFallback}
                                    className="text-red-600 hover:text-red-700"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={fallbackModel}
                                    onChange={(e) => setFallbackModel(e.target.value)}
                                    placeholder="e.g., gpt-3.5-turbo"
                                    className="flex-1 text-xs px-2 py-1 border rounded"
                                />
                                <button
                                    onClick={() => {
                                        if (fallbackModel) {
                                            setForcedFallback(fallbackModel);
                                            setFallbackModel('');
                                        }
                                    }}
                                    className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200"
                                >
                                    Set
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Provider Controls */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Providers</h4>
                    
                    {providers.map(provider => {
                        const isDisabled = status.disabledProviders.includes(provider);
                        const circuitState = status.providerCircuits[provider];
                        
                        return (
                            <div key={provider} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-2">
                                    {isDisabled ? (
                                        <PowerOff size={16} className="text-red-500" />
                                    ) : circuitState === 'OPEN' ? (
                                        <ShieldOff size={16} className="text-orange-500" />
                                    ) : (
                                        <Power size={16} className="text-green-500" />
                                    )}
                                    <span className="text-sm font-medium capitalize">{provider}</span>
                                    {circuitState && circuitState !== 'CLOSED' && (
                                        <span className={clsx(
                                            "text-xs px-1.5 py-0.5 rounded",
                                            circuitState === 'OPEN' && "bg-red-100 text-red-700",
                                            circuitState === 'HALF_OPEN' && "bg-yellow-100 text-yellow-700"
                                        )}>
                                            {circuitState}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    {circuitState && circuitState !== 'CLOSED' && (
                                        <button
                                            onClick={() => resetProviderCircuit(provider)}
                                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                            title="Reset Circuit"
                                        >
                                            <RefreshCw size={12} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => isDisabled ? enableProvider(provider) : disableProvider(provider, 'Manual disable')}
                                        className={clsx(
                                            "px-2 py-1 rounded text-xs font-medium transition-colors",
                                            isDisabled
                                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                                : "bg-red-100 text-red-700 hover:bg-red-200"
                                        )}
                                    >
                                        {isDisabled ? 'Enable' : 'Disable'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Keys Section */}
            <div className="border-t border-gray-100 p-4">
                <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Keys</h4>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                    {keys.map(key => {
                        const isDisabled = status.disabledKeys.includes(key.id);
                        const circuitState = status.keyCircuits[key.id];
                        
                        return (
                            <div 
                                key={key.id}
                                className={clsx(
                                    "p-2 rounded text-xs",
                                    isDisabled && "bg-red-50 border border-red-200",
                                    circuitState === 'OPEN' && !isDisabled && "bg-orange-50 border border-orange-200",
                                    !isDisabled && circuitState !== 'OPEN' && "bg-gray-50"
                                )}
                            >
                                <div className="font-medium truncate">{key.label}</div>
                                <div className="flex items-center justify-between mt-1">
                                    <span className={clsx(
                                        "text-xs",
                                        isDisabled && "text-red-600",
                                        circuitState === 'OPEN' && !isDisabled && "text-orange-600",
                                        !isDisabled && circuitState !== 'OPEN' && "text-gray-500"
                                    )}>
                                        {isDisabled ? 'Disabled' : circuitState || 'OK'}
                                    </span>
                                    <div className="flex gap-1">
                                        {circuitState && circuitState !== 'CLOSED' && (
                                            <button
                                                onClick={() => resetKeyCircuit(key.id)}
                                                className="text-blue-600 hover:text-blue-700"
                                                title="Reset Circuit"
                                            >
                                                <RefreshCw size={10} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => isDisabled ? enableKey(key.id) : disableKey(key.id, 'Manual disable')}
                                            className={clsx(
                                                isDisabled ? "text-green-600 hover:text-green-700" : "text-red-600 hover:text-red-700"
                                            )}
                                        >
                                            {isDisabled ? <Power size={10} /> : <PowerOff size={10} />}
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
                <div className="border-t border-gray-100 p-3 bg-gray-50">
                    <div className="text-xs text-gray-500">
                        Last Event: <code className="bg-gray-200 px-1 rounded">{lastEvent.type}</code>
                    </div>
                </div>
            )}
        </div>
    );
};
