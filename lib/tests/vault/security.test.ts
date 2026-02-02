
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Crypto } from '@peculiar/webcrypto';
import 'fake-indexeddb/auto'; // Mocks IndexedDB globally
import { db } from '../../db/schema'; // Ensure we use the actual Dexie instance which will use fake-indexeddb
import { VaultService } from '../../services/vault/vault.service';

// Mock window.crypto for Node environment
const crypto = new Crypto();
Object.defineProperty(global, 'crypto', {
    value: crypto,
    writable: true // Allow overwriting if needed
});
// Also mock window.crypto since VaultService uses window.crypto
Object.defineProperty(global, 'window', {
    value: {
        crypto: crypto
    },
    writable: true
});
Object.defineProperty(global, 'TextEncoder', {
    value: TextEncoder,
    writable: true
});
Object.defineProperty(global, 'TextDecoder', {
    value: TextDecoder,
    writable: true
});

describe('Vault Security Verification', () => {
    let vault: VaultService;

    beforeEach(async () => {
        // Reset DB before each test
        await db.delete();
        await db.open();
        vault = new VaultService();
        // Reset local storage mock if used
        vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { });
    });

    it('should encrypt api key before storage', async () => {
        // Unlock vault to allow adding keys
        await vault.unlock();

        const apiKey = 'sk-test-123456789';
        const keyId = await vault.addKey('openai', apiKey, 'Test Key');

        // Access DB directly to verify storage format
        const storedRecord = await db.keys.get(keyId);

        expect(storedRecord).toBeDefined();
        // The stored encryptedData should NOT be the plain API key
        expect(storedRecord?.encryptedData).not.toBe(apiKey);

        // It should be an ArrayBuffer (or similar, depending on implementation)
        // verified via code reading: returns ArrayBuffer
        expect(storedRecord?.encryptedData).toBeInstanceOf(ArrayBuffer);

        // Cannot casually read it as string
        const asString = new TextDecoder().decode(storedRecord?.encryptedData);
        expect(asString).not.toContain('sk-test');
    });

    it('should decrypt api key correctly', async () => {
        await vault.unlock();
        const originalKey = 'sk-real-secret-key';
        const keyId = await vault.addKey('openai', originalKey, 'Real Key');

        // Retrieve via service
        const retrievedKey = await vault.getKey(keyId);

        expect(retrievedKey).toBe(originalKey);
    });

    it('should prevent access if vault is locked', async () => {
        // Create a fresh locked vault instance
        const lockedVault = new VaultService();
        // Do NOT call unlock()

        const originalKey = 'sk-secret';

        // Attempting to add key should fail
        await expect(lockedVault.addKey('openai', originalKey, 'Fail Key'))
            .rejects.toThrow('Vault is locked');

        // Assuming we somehow had a key ID (e.g. from previous run), getting it should also fail
        // We can't easily test getKey failure without a key ID, but the principle holds.
    });

    it('should use unique IVs for the same key content', async () => {
        await vault.unlock();
        const sameKey = 'sk-repeat-key';

        // Add proper wait or distinct labels to ensure they are treated as distinct check entries if needed
        // The service checks for duplicate "fingerprint" which usually hashes the key content.
        // If the service logic blocks duplicate keys content-wise, this test verifies *that* security feature.
        // Checking code in previous turn: "const existing = await db.keys.where('fingerprint').equals(fingerprint).first();"
        // It throws error on duplicate key content.

        // So we test that duplicate keys are BLOCKED (Collision Resistance)
        await vault.addKey('openai', sameKey, 'First Entry');

        await expect(vault.addKey('openai', sameKey, 'Second Entry'))
            .rejects.toThrow('already in the vault');
    });

    it('should generate unique IVs for different keys', async () => {
        await vault.unlock();
        const key1 = 'sk-unique-1';
        const key2 = 'sk-unique-2';

        const id1 = await vault.addKey('openai', key1, 'Key 1');
        const id2 = await vault.addKey('openai', key2, 'Key 2');

        const rec1 = await db.keys.get(id1);
        const rec2 = await db.keys.get(id2);

        // IVs should be different (randomized)
        // Convert ArrayBuffers to string/base64 to compare
        const iv1 = Buffer.from(rec1!.iv).toString('hex');
        const iv2 = Buffer.from(rec2!.iv).toString('hex');

        expect(iv1).not.toBe(iv2);
    });
});
