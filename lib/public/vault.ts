import { vaultService } from '../services/vault/vault.service';
import { AIProviderId, KeySummary } from './types';
import { KeyMetadata } from '../models/metadata';

/**
 * Public Vault API
 * 
 * Provides a secure interface for managing AI API keys.
 * Handles automatic encryption/decryption and sanitizes data for public consumption.
 */
export const vault = {
    /**
     * Unlock the vault to enable key management and usage.
     */
    async unlock(password?: string): Promise<void> {
        return vaultService.unlock(password);
    },

    /**
     * Check if the vault is currently unlocked.
     */
    isUnlocked(): boolean {
        return vaultService.isVaultUnlocked();
    },

    /**
     * Securely add a new API key to the vault.
     */
    async addKey(providerId: AIProviderId, key: string, label: string, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<string> {
        return vaultService.addKey(providerId, key, label, priority);
    },

    /**
     * Remove a key from the vault by its ID.
     */
    async removeKey(id: string): Promise<void> {
        return vaultService.deleteKey(id);
    },

    /**
     * List all keys currently in the vault (sanitized).
     */
    async listKeys(): Promise<KeySummary[]> {
        const keys = await vaultService.listKeys();
        return keys.map(sanitizeKey);
    },

    /**
     * Update an existing key's metadata.
     */
    async updateKey(id: string, updates: Partial<KeySummary>): Promise<void> {
        // Only allow updating certain fields through public API
        const safeUpdates: any = {};
        if (updates.label !== undefined) safeUpdates.label = updates.label;
        if (updates.isEnabled !== undefined) safeUpdates.isEnabled = updates.isEnabled;
        if (updates.priority !== undefined) safeUpdates.priority = updates.priority;

        return vaultService.updateKey(id, safeUpdates);
    }
};

/**
 * Internal helper to convert internal KeyMetadata to public KeySummary.
 */
function sanitizeKey(key: KeyMetadata): KeySummary {
    return {
        id: key.id,
        providerId: key.providerId,
        label: key.label,
        status: key.verificationStatus || 'untested',
        tier: key.tier,
        isEnabled: key.isEnabled ?? true,
        isRevoked: key.isRevoked,
        priority: key.priority || 'medium',
        lastUsedAt: key.lastUsed,
        models: key.verifiedModels || []
    };
}
