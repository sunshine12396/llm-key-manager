export class CryptoService {
  private static ALGO = "AES-GCM";

  /**
   * Helper to get the SubtleCrypto instance or throw a descriptive error.
   */
  private static getSubtleCrypto(): SubtleCrypto {
    if (
      typeof window === "undefined" ||
      !window.crypto ||
      !window.crypto.subtle
    ) {
      throw new Error(
        "Web Crypto API is not available (window.crypto.subtle is undefined). " +
          "This application requires a secure browser context (HTTPS or localhost) " +
          "or a polyfill in Node.js/SSR environments.",
      );
    }
    return window.crypto.subtle;
  }

  /**
   * Encrypts plaintext using a given CryptoKey.
   */
  static async encrypt(
    plaintext: string,
    key: CryptoKey,
  ): Promise<{ cipherText: ArrayBuffer; iv: ArrayBuffer }> {
    const subtle = this.getSubtleCrypto(); // Check availability first
    const encoded = new TextEncoder().encode(plaintext);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const cipherText = await subtle.encrypt(
      {
        name: this.ALGO,
        iv,
      },
      key,
      encoded,
    );

    return { cipherText, iv: iv.buffer as ArrayBuffer };
  }

  /**
   * Decrypts ciphertext using a given CryptoKey.
   */
  static async decrypt(
    cipherText: ArrayBuffer,
    iv: ArrayBuffer,
    key: CryptoKey,
  ): Promise<string> {
    const subtle = this.getSubtleCrypto();
    const decrypted = await subtle.decrypt(
      {
        name: this.ALGO,
        iv: new Uint8Array(iv),
      },
      key,
      cipherText,
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Generates a new random encryption key for the vault.
   * This is stored in memory or potentially wrapped by a Master Password.
   */
  static async generateKey(): Promise<CryptoKey> {
    const subtle = this.getSubtleCrypto();
    return subtle.generateKey(
      {
        name: this.ALGO,
        length: 256,
      },
      true,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Generates a hash fingerprint of a string for duplicate detection.
   */
  static async generateFingerprint(text: string): Promise<string> {
    const subtle = this.getSubtleCrypto();
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  }
}
