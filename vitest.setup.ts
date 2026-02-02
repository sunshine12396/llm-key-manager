import { vi, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';
import { Crypto } from '@peculiar/webcrypto';

// Polyfill SubtleCrypto if needed (happy-dom might not have it or it might be incomplete)
if (!globalThis.crypto) {
    (globalThis as any).crypto = new Crypto();
}

// Mocking window.crypto.subtle for environments where it's missing (Node.js)
if (!globalThis.crypto.subtle) {
    const crypto = new Crypto();
    (globalThis.crypto as any).subtle = crypto.subtle;
}
