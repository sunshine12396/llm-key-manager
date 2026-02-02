/**
 * useSafetyGuard Hook
 * 
 * React hook for accessing and controlling the Safety Guard system.
 * Provides real-time status updates and control methods.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
    safetyGuard, 
    type SafetyStatus, 
    type SafetyEvent
} from '../services/availability';
import type { AIProviderId } from '../models/types';

export interface UseSafetyGuardReturn {
    // Status
    status: SafetyStatus | null;
    
    // Global controls
    disableProvider: (providerId: AIProviderId, reason: string) => void;
    enableProvider: (providerId: AIProviderId) => void;
    freezeScanning: (reason: string) => void;
    resumeScanning: () => void;
    setForcedFallback: (model: string, provider?: AIProviderId) => void;
    clearForcedFallback: () => void;
    enableEmergencyMode: (reason: string) => void;
    disableEmergencyMode: () => void;
    
    // Per-key controls
    disableKey: (keyId: string, reason: string) => void;
    enableKey: (keyId: string) => void;
    resetKeyCircuit: (keyId: string) => void;
    resetProviderCircuit: (providerId: AIProviderId) => void;
    
    // Combined check
    shouldAllowRequest: (keyId: string, providerId: AIProviderId) => {
        allowed: boolean;
        reason?: string;
        fallback?: { model: string; provider?: AIProviderId };
    };
    
    // Reset all
    resetAll: () => void;
    
    // Events
    lastEvent: SafetyEvent | null;
}

export function useSafetyGuard(): UseSafetyGuardReturn {
    const [status, setStatus] = useState<SafetyStatus | null>(null);
    const [lastEvent, setLastEvent] = useState<SafetyEvent | null>(null);

    // Refresh status
    const refreshStatus = useCallback(() => {
        setStatus(safetyGuard.getStatus());
    }, []);

    // Subscribe to events
    useEffect(() => {
        // Initial load
        refreshStatus();

        // Subscribe to changes
        const unsubscribe = safetyGuard.subscribe((event) => {
            setLastEvent(event);
            refreshStatus();
        });

        return unsubscribe;
    }, [refreshStatus]);

    // Memoized control methods
    const controls = useMemo(() => ({
        disableProvider: (providerId: AIProviderId, reason: string) => {
            safetyGuard.disableProvider(providerId, reason);
        },
        enableProvider: (providerId: AIProviderId) => {
            safetyGuard.enableProvider(providerId);
        },
        freezeScanning: (reason: string) => {
            safetyGuard.freezeScanning(reason);
        },
        resumeScanning: () => {
            safetyGuard.resumeScanning();
        },
        setForcedFallback: (model: string, provider?: AIProviderId) => {
            safetyGuard.setForcedFallback(model, provider);
        },
        clearForcedFallback: () => {
            safetyGuard.clearForcedFallback();
        },
        enableEmergencyMode: (reason: string) => {
            safetyGuard.enableEmergencyMode(reason);
        },
        disableEmergencyMode: () => {
            safetyGuard.disableEmergencyMode();
        },
        disableKey: (keyId: string, reason: string) => {
            safetyGuard.disableKey(keyId, reason);
        },
        enableKey: (keyId: string) => {
            safetyGuard.enableKey(keyId);
        },
        resetKeyCircuit: (keyId: string) => {
            safetyGuard.resetKeyCircuit(keyId);
        },
        resetProviderCircuit: (providerId: AIProviderId) => {
            safetyGuard.resetProviderCircuit(providerId);
        },
        shouldAllowRequest: (keyId: string, providerId: AIProviderId) => {
            return safetyGuard.shouldAllowRequest(keyId, providerId);
        },
        resetAll: () => {
            safetyGuard.resetAll();
        },
    }), []);

    return {
        status,
        lastEvent,
        ...controls,
    };
}

export default useSafetyGuard;
