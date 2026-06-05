# Data Layer — IndexedDB Schema

All persistent data is stored in the browser using **IndexedDB** via the Dexie.js wrapper. No data ever leaves the client.

## Database: `llm-key-manager`

### Tables

| Table | Purpose | Phase | Key Fields |
|:------|:--------|:------|:-----------|
| `keys` | Encrypted API key storage | Phase 1 | `id`, `providerId`, `encryptedData`, `iv`, `fingerprint`, `label`, `priority`, `verificationStatus` |
| `modelCache` | Per-key model availability results | Phase 2 | `keyId+modelId` (compound), `providerId`, `state`, `isAvailable` |
| `quotas` | Token usage tracking per key | Phase 4 | `keyId`, `limit`, `used`, `estimatedCost`, `resetTime` |
| `usageLogs` | Request usage analytics | Phase 5 | `timestamp`, `keyId`, `providerId`, `modelId`, `inputTokens`, `outputTokens`, `cost` |
| `errorLogs` | Error tracking (redacted) | Phase 5 | `timestamp`, `keyId`, `providerId`, `errorType`, `message` |

### Encryption Strategy

```
App unlocks vault → VaultService.unlock()
                    │
                    ├── Import JWK master key from localStorage (`ai_vault_master_key`), if present
                    ├── Otherwise generate random 256-bit AES-GCM key via Web Crypto API
                    └── Export generated key as JWK and persist it in localStorage

User adds key → VaultService.addKey(key)
                    │
                    ├── Generate SHA-256 fingerprint for duplicate detection
                    ├── Generate random IV (12 bytes)
                    ├── Encrypt with AES-256-GCM
                    └── Store: { encryptedData, iv, fingerprint, metadata } in IndexedDB

Request needs key → CryptoService.decrypt(stored)
                    │
                    ├── Require unlocked in-memory CryptoKey
                    ├── Decrypt with AES-256-GCM using stored IV
                    └── Return plaintext (in-memory only, never persisted)
```

### In-Memory Layers

| Layer | Storage | Purpose | TTL |
|:------|:--------|:--------|:----|
| `AvailabilityCache` | Memory (Map) | O(1) model/key lookup for routing | 5 min |
| `SafetyGuard` state | `localStorage` | Circuit breaker states, disabled providers | Persistent |
| `StickyModels` | Memory (Map) | Session-level model/key stickiness | Session |
