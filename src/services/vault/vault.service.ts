import { db } from '../../db/schema';
import { CryptoService } from './crypto.service';
import { StoredKey, KeyMetadata, AIProviderId, KeyVerificationStatus } from '../../models';
import { v4 as uuidv4 } from 'uuid';

export class VaultService {
    private encryptionKey: CryptoKey | null = null;
    private isUnlocked: boolean = false;
    private decryptedKeyCache = new Map<string, string>();
    private metadataCache = new Map<string, KeyMetadata>();

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
        this.clearCache();
    }

    isVaultUnlocked(): boolean {
        return this.isUnlocked;
    }

    clearCache(): void {
        this.decryptedKeyCache.clear();
        this.metadataCache.clear();
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

        // Populate cache
        const { encryptedData: _, iv: __, ...meta } = newKey;
        this.metadataCache.set(id, meta);
        this.decryptedKeyCache.set(id, apiKey);

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

        // Update cache
        const cachedMeta = this.metadataCache.get(id);
        if (cachedMeta) {
            this.metadataCache.set(id, {
                ...cachedMeta,
                ...updates,
            });
        }
    }

    async getKeyMetadata(id: string): Promise<KeyMetadata | null> {
        const cached = this.metadataCache.get(id);
        if (cached !== undefined) return cached;

        const record = await db.keys.get(id);
        if (!record) return null;

        const { encryptedData, iv, ...meta } = record;
        this.metadataCache.set(id, meta);
        return meta;
    }

    async getKey(id: string): Promise<string> {
        if (!this.encryptionKey) throw new Error('Vault is locked');

        const cached = this.decryptedKeyCache.get(id);
        if (cached !== undefined) return cached;

        const record = await db.keys.get(id);
        if (!record) throw new Error('Key not found');

        const decrypted = await CryptoService.decrypt(record.encryptedData, record.iv, this.encryptionKey);
        this.decryptedKeyCache.set(id, decrypted);
        return decrypted;
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

        // Update cache
        const cachedMeta = this.metadataCache.get(id);
        if (cachedMeta) {
            this.metadataCache.set(id, {
                ...cachedMeta,
                ...updates,
            });
        }
    }

    async revokeKey(id: string): Promise<void> {
        await db.keys.update(id, { isRevoked: true });

        // Update cache
        const cachedMeta = this.metadataCache.get(id);
        if (cachedMeta) {
            this.metadataCache.set(id, {
                ...cachedMeta,
                isRevoked: true,
            });
        }
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

        // Remove from cache
        this.decryptedKeyCache.delete(id);
        this.metadataCache.delete(id);
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
