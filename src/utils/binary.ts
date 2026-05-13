/**
 * Base64 encode an ArrayBuffer
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Base64 decode to ArrayBuffer
 */
export function base64ToBuffer(base64: string): ArrayBuffer {
    const binary = window.atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
}
