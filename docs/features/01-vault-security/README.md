# Feature 1: Vault & Key Security

> **Phase:** 1 (Foundation) · **Status:** ✅ Complete

## Purpose

Securely store and manage multiple LLM API keys in the browser without ever sending them to a backend server. Keys are encrypted at rest using AES-256-GCM and only decrypted in-memory during active API requests.

## User Flow

1. User opens "Add Key" form → selects provider → enters API key
2. Real-time format validation: `sk-...` (OpenAI), `sk-ant-...` (Anthropic), `AIzaSy...` (Gemini)
3. Key is encrypted via Web Crypto API → stored in IndexedDB `keys` table
4. Key appears in dashboard with "Untested" status badge
5. Background validation is queued automatically (→ see Feature 2)

## Core API

```typescript
// Unlock the vault before encryption/decryption operations.
// The optional password parameter is reserved; no passphrase derivation is implemented yet.
await vaultService.unlock();

// Check whether the vault encryption key has been initialized
const unlocked = vaultService.isVaultUnlocked();

// Add a new key (encrypts and stores)
const id = await vaultService.addKey(providerId, apiKey, label, priority);

// Retrieve decrypted key (in-memory only)
const plainKey = await vaultService.getKey(keyId);

// List all keys (metadata only, no plaintext)
const keys = await vaultService.listKeys();

// Update key metadata
await vaultService.updateKey(keyId, { label, priority, verificationStatus });

// Revoke a key (marks as revoked, excluded from routing)
await vaultService.revokeKey(keyId);

// Delete a key and clean up its model availability records
await vaultService.deleteKey(keyId);

// Export/import encrypted vault records as JSON
const json = await vaultService.exportVault();
const result = await vaultService.importVault(json);
```

## Key Files

| File | Purpose |
|:-----|:--------|
| `src/services/vault/vault.service.ts` | Key CRUD, encryption/decryption orchestration |
| `src/services/vault/crypto.service.ts` | AES-256-GCM encrypt/decrypt via Web Crypto API |
| `src/db/schema.ts` | IndexedDB schema definition (Dexie) |
| `src/components/forms/AddKeyForm.tsx` | React form with real-time format validation |
| `src/providers/types.ts` | `IProviderAdapter.validateKeyFormat()` interface |

## Security Guarantees

- **Encryption**: AES-256-GCM with random 12-byte IVs via the Web Crypto API
- **Master key persistence**: The current implementation generates a random 256-bit AES-GCM key with `window.crypto.subtle.generateKey()`, exports it as JWK, and stores it in `localStorage` as `ai_vault_master_key` so encrypted vault entries survive reloads. PBKDF2/passphrase derivation is not implemented yet.
- **Unlock requirement**: `addKey()` and `getKey()` require `vaultService.unlock()` first; otherwise they throw `Vault is locked`.
- **No network exposure**: Keys never leave the browser
- **Metadata masking**: `listKeys()` returns labels and status only, never plaintext
- **Duplicate prevention**: `addKey()` stores a SHA-256 fingerprint of each plaintext API key and rejects duplicate fingerprints before encrypting and saving.
- **Revocation**: Revoked keys are immediately excluded from all routing
- **Deletion cleanup**: `deleteKey()` removes the key from IndexedDB and calls `availabilityManager.deleteKeyModels(keyId)` to remove orphaned model availability records.
- **Usage statistics**: Successful requests increment `usageCount` and update `averageLatency` using an 80% previous / 20% latest rolling average.
