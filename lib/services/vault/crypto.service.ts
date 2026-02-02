export class CryptoService {
    private static ALGO = 'AES-GCM';

    /**
     * Encrypts plaintext using a given CryptoKey.
     */
    static async encrypt(plaintext: string, key: CryptoKey): Promise<{ cipherText: ArrayBuffer; iv: ArrayBuffer }> {
        const encoded = new TextEncoder().encode(plaintext);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const cipherText = await window.crypto.subtle.encrypt(
            {
                name: this.ALGO,
                iv,
            },
            key,
            encoded
        );

        return { cipherText, iv: iv.buffer as ArrayBuffer };
    }

    /**
     * Decrypts ciphertext using a given CryptoKey.
     */
    static async decrypt(cipherText: ArrayBuffer, iv: ArrayBuffer, key: CryptoKey): Promise<string> {
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: this.ALGO,
                iv: new Uint8Array(iv),
            },
            key,
            cipherText
        );

        return new TextDecoder().decode(decrypted);
    }

    /**
     * Generates a new random encryption key for the vault.
     * This is stored in memory or potentially wrapped by a Master Password.
     */
    static async generateKey(): Promise<CryptoKey> {
        return window.crypto.subtle.generateKey(
            {
                name: this.ALGO,
                length: 256,
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Generates a hash fingerprint of a string for duplicate detection.
     */
    static async generateFingerprint(text: string): Promise<string> {
        const msgUint8 = new TextEncoder().encode(text);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
}
