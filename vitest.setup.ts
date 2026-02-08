import { vi, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import { Crypto } from "@peculiar/webcrypto";

// Polyfill SubtleCrypto if needed (happy-dom might not have it or it might be incomplete)
const cryptoPolyfill = new Crypto();

// 1. Ensure globalThis.crypto exists and has subtle
if (!globalThis.crypto) {
  (globalThis as any).crypto = cryptoPolyfill;
} else if (!globalThis.crypto.subtle) {
  (globalThis.crypto as any).subtle = cryptoPolyfill.subtle;
}

// 2. Ensure window.crypto exists and has subtle (for happy-dom/jsdom)
if (typeof window !== "undefined") {
  if (!window.crypto) {
    (window as any).crypto = cryptoPolyfill;
  } else if (!window.crypto.subtle) {
    (window.crypto as any).subtle = cryptoPolyfill.subtle;
  }
}
