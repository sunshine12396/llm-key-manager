
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Crypto } from '@peculiar/webcrypto';
import 'fake-indexeddb/auto';
import { db } from '../../db/schema';
import { VaultService } from '../../services/vault/vault.service';

const crypto = new Crypto();
Object.defineProperty(global, 'crypto', { value: crypto, writable: true });
Object.defineProperty(global, 'window', { value: { crypto: crypto }, writable: true });
Object.defineProperty(global, 'TextEncoder', { value: TextEncoder, writable: true });
Object.defineProperty(global, 'TextDecoder', { value: TextDecoder, writable: true });

describe('Advanced Key Management Features', () => {
    let vault: VaultService;

    beforeEach(async () => {
        await db.delete();
        await db.open();
        vault = new VaultService();
        await vault.unlock();
        vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { });
    });

    it('should support adding multiple keys for the same provider', async () => {
        const id1 = await vault.addKey('openai', 'sk-key-1', 'OpenAI Key 1');
        const id2 = await vault.addKey('openai', 'sk-key-2', 'OpenAI Key 2');

        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);

        const keys = await vault.listKeys('openai');
        expect(keys.length).toBe(2);
        expect(keys.find(k => k.id === id1)).toBeDefined();
        expect(keys.find(k => k.id === id2)).toBeDefined();
    });

    it('should filter keys by provider correctly', async () => {
        await vault.addKey('openai', 'sk-openai', 'OpenAI Key');
        await vault.addKey('anthropic', 'sk-anthropic', 'Claude Key');

        const openaiKeys = await vault.listKeys('openai');
        expect(openaiKeys.length).toBe(1);
        expect(openaiKeys[0].providerId).toBe('openai');

        const anthropicKeys = await vault.listKeys('anthropic');
        expect(anthropicKeys.length).toBe(1);
        expect(anthropicKeys[0].providerId).toBe('anthropic');

        const allKeys = await vault.listKeys();
        expect(allKeys.length).toBe(2);
    });

    it('should update key priority levels', async () => {
        const id = await vault.addKey('openai', 'sk-priority-test', 'Priority Test', 'low');

        let key = (await vault.listKeys()).find(k => k.id === id);
        expect(key?.priority).toBe('low');

        await vault.updateKey(id, { priority: 'high' });

        key = (await vault.listKeys()).find(k => k.id === id);
        expect(key?.priority).toBe('high');
    });

    it('should support bulk deletion of keys', async () => {
        const keysToDelete = [
            await vault.addKey('openai', 'sk-del-1', 'Delete 1'),
            await vault.addKey('openai', 'sk-del-2', 'Delete 2'),
            await vault.addKey('openai', 'sk-del-3', 'Delete 3')
        ];

        // Simulate bulk delete by iterating (since service implies atomic single delete)
        // Library consumers would do Promise.all
        await Promise.all(keysToDelete.map(id => vault.deleteKey(id)));

        const remaining = await vault.listKeys();
        expect(remaining.length).toBe(0);
    });
});
