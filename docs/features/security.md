# 🛡️ Security & Privacy Architecture

The AI Key Manager is built with a "Privacy First, Zero Trust" philosophy. Since the application is browser-only, your API keys never touch a server, an analytics engine, or any cloud synchronization service.

## 🔐 Encryption (AES-256-GCM)

All API keys are encrypted at rest before being persisted to the browser's storage (IndexedDB).

### How it Works:
1.  **Algorithm**: We use **AES-GCM (Galois/Counter Mode)** with a 256-bit key. This is a "Combined Mode" that provides both confidentiality and authenticity.
2.  **IV (Initialization Vector)**: Every encryption operation generates a unique 12-byte random IV using `window.crypto.getRandomValues()`.
3.  **SubtleCrypto**: We utilize the native **Web Crypto API** (`crypto.subtle`), ensuring the encryption happens at a low level within the browser's secure context.

```typescript
// Core encryption logic from CryptoService
const iv = window.crypto.getRandomValues(new Uint8Array(12));
const cipherText = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
);
```

## 🧠 Key Fingerprinting

To prevent users from accidentally adding the same API key multiple times (which would complicate routing and quota management), we generate a **SHA-256 hash fingerprint** of every key.

-   The fingerprint is stored alongside the encrypted key.
-   When adding a new key, the system compares its fingerprint against existing ones.
-   **Security Note**: Fingerprints are one-way hashes and do not leak the original key content.

## 📦 Local-Only Storage

We do not use `localStorage` for keys because it is susceptible to XSS and has size limitations. Instead, we use **IndexedDB** (via [Dexie.js](https://dexie.org/)):

-   **Isolation**: Each origin (domain) has its own isolated IndexedDB database.
-   **Persistence**: Keys remain stored across browser restarts but never leave your device.
-   **No Cloud Sync**: We intentionally do not implement cloud sync to ensure that your "Keys stay in your hands."

## 🚧 Safety Guards (Circuit Breaker)

Beyond encryption, the system protects your providers from "Retry Storms":
-   **Circuit Breakers**: If a key or provider fails repeatedly (e.g., persistent 401 Unauthenticated), the system "opens the circuit" and stops trying that key for a cooldown period.
-   **Automatic Disabling**: Keys that return permanent errors (Revoked/Expired) are automatically moved to a `PERM_FAILED` state.
