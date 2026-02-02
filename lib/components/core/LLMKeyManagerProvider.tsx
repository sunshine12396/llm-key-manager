import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { vaultService } from '../../services/vault/vault.service';
import { backgroundValidator } from '../../services';
import { ValidationEvent, BackgroundValidationResult } from '../../lifecycle/validator.job';
import { backgroundJobs } from '../../lifecycle/background-jobs';
import { modelMetadataService } from '../../services/engines/model-discovery.service';
import { KeyMetadata, AIProviderId, KeyVerificationStatus } from '../../models/metadata';

interface LLMKeyManagerContextType {
    isUnlocked: boolean;
    unlockVault: () => Promise<void>;
    addKey: (providerId: AIProviderId, key: string, label: string, priority?: 'high' | 'medium' | 'low') => Promise<string>;
    updateKey: (id: string, updates: {
        label?: string;
        isEnabled?: boolean;
        priority?: 'high' | 'medium' | 'low';
        verifiedModels?: string[];
        verificationStatus?: KeyVerificationStatus;
    }) => Promise<void>;
    deleteKey: (id: string) => Promise<void>;
    keys: KeyMetadata[];
    refreshKeys: () => Promise<KeyMetadata[]>;
    validateKey: (id: string) => Promise<void>;
    // New: Validation event system
    validationEvents: ValidationEvent[];
    dismissValidationEvent: (keyId: string) => void;
    getValidationResult: (keyId: string) => BackgroundValidationResult | undefined;
    isValidating: (keyId: string) => boolean;
}

const LLMKeyManagerContext = createContext<LLMKeyManagerContextType | undefined>(undefined);

export const LLMKeyManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [keys, setKeys] = useState<KeyMetadata[]>([]);
    const [validationEvents, setValidationEvents] = useState<ValidationEvent[]>([]);

    // Subscribe to background validation events
    useEffect(() => {
        const unsubscribe = backgroundValidator.subscribe((event) => {
            // Update events list
            setValidationEvents(prev => {
                // Remove existing event for this key and add new one
                const filtered = prev.filter(e => e.keyId !== event.keyId);
                return [...filtered, event];
            });

            // Refresh keys when validation completes or fails
            if (event.type === 'validation_complete' || event.type === 'validation_failed') {
                refreshKeys();
            }
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        // Auto-unlock for MVP simplicity
        vaultService.unlock().then(async () => {
            setIsUnlocked(true);
            await refreshKeys();

            // Start all background lifecycle services
            backgroundJobs.start();
        });
    }, []);

    const refreshKeys = useCallback(async (): Promise<KeyMetadata[]> => {
        try {
            const allKeys = await vaultService.listKeys();
            setKeys(allKeys);
            return allKeys;
        } catch (e) {
            console.error(e);
            return [];
        }
    }, []);

    const addKey = async (
        providerId: AIProviderId,
        key: string,
        label: string,
        priority?: 'high' | 'medium' | 'low'
    ): Promise<string> => {
        // ============================================
        // PHASE 1: Immediate Validation
        // ============================================
        // Format validation is done in AddKeyForm before this is called
        // Duplicate check happens inside vaultService.addKey (throws if duplicate)

        // ============================================
        // PHASE 2: Save to Database
        // ============================================
        const id = await vaultService.addKey(providerId, key, label, priority);

        // Set initial status
        await vaultService.updateKey(id, {
            verificationStatus: 'untested',
            verifiedModels: []
        });

        await refreshKeys();

        // ============================================
        // PHASE 3: Background Validation (Async)
        // ============================================
        // This runs in the background and will:
        // 1. Validate key with provider
        // 2. List all available models
        // 3. Loop through each model and check availability
        // 4. Fetch per-model rate limits/quota
        // 5. Cache verified models to modelCache table
        // 6. Update key status
        console.log(`[LLMKeyManagerProvider] Starting background validation for key ${id}...`);

        // Fire and forget - validation runs in background
        backgroundValidator.validateKey(id, providerId, key, label)
            .then(result => {
                console.log(`[LLMKeyManagerProvider] Key ${id} validation complete:`, result.status);
                console.log(`[LLMKeyManagerProvider] Verified ${result.models.length} models`);
            })
            .catch(err => {
                console.error(`[LLMKeyManagerProvider] Key ${id} validation error:`, err);
            });

        return id;
    };

    const updateKey = async (id: string, updates: {
        label?: string;
        isEnabled?: boolean;
        priority?: 'high' | 'medium' | 'low';
        verifiedModels?: string[];
        verificationStatus?: KeyVerificationStatus;
    }) => {
        await vaultService.updateKey(id, updates);
        await refreshKeys();
    };

    const deleteKey = async (id: string) => {
        // Cancel any ongoing validation
        backgroundValidator.cancelValidation(id);

        // Delete cached model metadata for this key
        await modelMetadataService.deleteModelsForKey(id);

        await vaultService.deleteKey(id);
        await refreshKeys();

        // Remove from events
        setValidationEvents(prev => prev.filter(e => e.keyId !== id));
    };

    const unlockVault = async () => {
        await vaultService.unlock();
        setIsUnlocked(true);
        await refreshKeys();
    };

    const validateKey = async (id: string) => {
        try {
            const allKeys = await vaultService.listKeys();
            const target = allKeys.find(k => k.id === id);
            if (!target) return;

            const apiKey = await vaultService.getKey(id);

            // Use background validator
            console.log(`[BackgroundValidator] Re-validating key ${id}...`);
            backgroundValidator.validateKey(id, target.providerId, apiKey, target.label);

        } catch (e) {
            console.error(`Failed to validate key ${id}`, e);
        }
    };

    const dismissValidationEvent = (keyId: string) => {
        setValidationEvents(prev => prev.filter(e => e.keyId !== keyId));
    };

    const getValidationResult = (keyId: string) => {
        return backgroundValidator.getValidationResult(keyId);
    };

    const isValidating = (keyId: string) => {
        return backgroundValidator.isValidating(keyId);
    };

    return (
        <LLMKeyManagerContext.Provider value={{
            isUnlocked,
            unlockVault,
            addKey,
            updateKey,
            deleteKey,
            keys,
            refreshKeys,
            validateKey,
            validationEvents,
            dismissValidationEvent,
            getValidationResult,
            isValidating
        }}>
            {children}
        </LLMKeyManagerContext.Provider>
    );
};

export const useLLMKeyManager = () => {
    const context = useContext(LLMKeyManagerContext);
    if (context === undefined) {
        throw new Error('useLLMKeyManager must be used within an LLMKeyManagerProvider');
    }
    return context;
};
