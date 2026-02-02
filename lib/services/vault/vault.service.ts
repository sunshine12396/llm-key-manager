import { db } from '../../db/schema';
import { CryptoService } from './crypto.service';
import { StoredKey, KeyMetadata, AIProviderId, KeyVerificationStatus } from '../../models/metadata';
import { v4 as uuidv4 } from 'uuid';

export class VaultService {
    private encryptionKey: CryptoKey | null = null;
    private isUnlocked: boolean = false;

    constructor() {
        // In a real app, we might check if a key exists in SessionStorage
    }

    /**
     * Unlocks the vault by generating or retrieving the encryption key.
     * For MVP, we generate a session-based key if none exists.
     */
    async unlock(_password?: string): Promise<void> {
        if (this.isUnlocked) return;

        // Try to retrieve key from storage to allow persistence across reloads
        const storedKey = localStorage.getItem('ai_vault_master_key');

        if (storedKey) {
            try {
                // Import the stored key
                const keyData = JSON.parse(storedKey);
                this.encryptionKey = await window.crypto.subtle.importKey(
                    'jwk',
                    keyData,
                    { name: 'AES-GCM', length: 256 },
                    true,
                    ['encrypt', 'decrypt']
                );
            } catch (e) {
                console.error('Failed to import stored key, generating new one', e);
            }
        }

        if (!this.encryptionKey) {
            // Generate new key
            this.encryptionKey = await CryptoService.generateKey();

            // Export and save to storage
            const exportedKey = await window.crypto.subtle.exportKey('jwk', this.encryptionKey);
            localStorage.setItem('ai_vault_master_key', JSON.stringify(exportedKey));
        }

        this.isUnlocked = true;
    }

    isVaultUnlocked(): boolean {
        return this.isUnlocked;
    }

    async addKey(providerId: AIProviderId, apiKey: string, label: string, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<string> {
        if (!this.encryptionKey) throw new Error('Vault is locked');

        // Check for duplicates using fingerprint
        const fingerprint = await CryptoService.generateFingerprint(apiKey);
        const existing = await db.keys.where('fingerprint').equals(fingerprint).first();

        if (existing) {
            throw new Error(`This API key is already in the vault (Label: ${existing.label})`);
        }

        const { cipherText, iv } = await CryptoService.encrypt(apiKey, this.encryptionKey);

        const id = uuidv4();
        const newKey: StoredKey = {
            id,
            providerId,
            label,
            encryptedData: cipherText,
            iv,
            fingerprint,
            createdAt: Date.now(),
            usageCount: 0,
            isRevoked: false,
            isEnabled: true,
            priority,
            averageLatency: 0
        };

        await db.keys.add(newKey);
        return id;
    }

    // Optimized method for updating statistical data
    async updateUsageStats(id: string, latencyMs: number, isSuccess: boolean): Promise<void> {
        const key = await db.keys.get(id);
        if (!key) return;

        const updates: Partial<StoredKey> = {
            lastUsed: Date.now(),
        };

        if (isSuccess) {
            updates.usageCount = (key.usageCount || 0) + 1;

            // Rolling average for latency (weighted 80/20)
            const currentAvg = key.averageLatency || 0;
            const newAvg = currentAvg === 0 ? latencyMs : Math.round((currentAvg * 0.8) + (latencyMs * 0.2));
            updates.averageLatency = newAvg;
        }

        await db.keys.update(id, updates);
    }

    async getKey(id: string): Promise<string> {
        if (!this.encryptionKey) throw new Error('Vault is locked');

        const record = await db.keys.get(id);
        if (!record) throw new Error('Key not found');

        return CryptoService.decrypt(record.encryptedData, record.iv, this.encryptionKey);
    }

    async updateKey(id: string, updates: {
        label?: string;
        isEnabled?: boolean;
        priority?: 'high' | 'medium' | 'low';
        verifiedModels?: string[];
        verificationStatus?: KeyVerificationStatus;
        tier?: string;
        rateLimits?: KeyMetadata['rateLimits'];
        retryAfter?: number;
        nextRetryAt?: number;
    }): Promise<void> {
        const key = await db.keys.get(id);
        if (!key) throw new Error('Key not found');

        await db.keys.update(id, {
            ...updates,
        });
    }

    /**
     * Exports the entire vault as an encrypted JSON blob.
     * Note: The keys remain encrypted with the master key.
     */
    async exportVault(): Promise<string> {
        const { bufferToBase64 } = await import('../../utils/binary');
        const records = await db.keys.toArray();

        // Convert buffers to base64 for JSON serialization
        const serializedKeys = records.map(key => ({
            ...key,
            encryptedData: bufferToBase64(key.encryptedData),
            iv: bufferToBase64(key.iv)
        }));

        const exportData = {
            version: '1.0',
            exportedAt: Date.now(),
            keys: serializedKeys
        };
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Imports keys from a vault export.
     * Merges with existing keys by ID.
     */
    async importVault(jsonString: string): Promise<{ added: number, updated: number }> {
        const { base64ToBuffer } = await import('../../utils/binary');
        try {
            const data = JSON.parse(jsonString);
            if (!data.keys || !Array.isArray(data.keys)) {
                throw new Error('Invalid vault export format');
            }

            let added = 0;
            let updated = 0;

            for (const keyData of data.keys) {
                // Restore buffers from base64
                const key = {
                    ...keyData,
                    encryptedData: base64ToBuffer(keyData.encryptedData),
                    iv: base64ToBuffer(keyData.iv)
                };

                const existing = await db.keys.get(key.id);
                if (existing) {
                    await db.keys.update(key.id, key);
                    updated++;
                } else {
                    await db.keys.add(key);
                    added++;
                }
            }

            return { added, updated };
        } catch (e) {
            console.error('Vault import failed', e);
            throw new Error('Failed to import vault: ' + (e instanceof Error ? e.message : 'Unknown error'));
        }
    }

    async revokeKey(id: string): Promise<void> {
        await db.keys.update(id, { isRevoked: true });
    }

    async deleteKey(id: string): Promise<void> {
        // Delete associated model entries
        try {
            const { availabilityManager } = await import('../availability');
            await availabilityManager.deleteKeyModels(id);
        } catch (e) {
            console.warn('[VaultService] Failed to delete model entries for key', e);
        }
        
        await db.keys.delete(id);
    }

    async listKeys(providerId?: AIProviderId): Promise<KeyMetadata[]> {
        let collection = db.keys.toCollection();

        if (providerId) {
            collection = db.keys.where('providerId').equals(providerId);
        }

        const records = await collection.toArray();

        // Return only metadata, not encrypted blobs
        return records.map(({ encryptedData, iv, ...meta }) => meta);
    }
}

export const vaultService = new VaultService();
