import webcrypto from "@peculiar/webcrypto";
import "fake-indexeddb/auto";
import { llmClient, vault } from '../src';

// Polyfill WebCrypto for Node.js
if (typeof global !== 'undefined' && !global.crypto) {
    (global as any).crypto = new webcrypto.Crypto();
}

async function runExample() {
    console.log("Setting up LLM Key Manager...");
    
    // Unlock the vault before interacting with it
    if (!vault.isUnlocked()) {
        await vault.unlock();
    }
    
    // 1. You could programmatically add a key (usually done via UI)
    // Replace with a real key to test
    const dummyKey = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    
    try {
        const keyId = await vault.addKey(
            "openai",
            dummyKey,
            "Example Demo Key",
            "high"
        );
        console.log(`✅ Key securely added to local vault with ID: ${keyId}`);
    } catch (error) {
        console.log("Key might already exist or format is invalid.");
    }
    
    // 2. Perform a chat request. The system will automatically select the best key,
    // handle any rate limits, and fallback if necessary.
    console.log("\nSending prompt to unified client...");
    try {
        const response = await llmClient.chat({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: "Say hello!" }]
        });
        
        console.log("Response received:");
        console.log(response.content);
    } catch (error: any) {
        console.error("Failed to execute request. Ensure you have a valid API key in the vault.");
        console.error("Error details:", error.message);
    }
}

// In a Node environment, IndexedDB and WebCrypto are not natively available
// without polyfills.
console.log("This example demonstrates usage syntax in a Node.js environment.");
runExample().catch(console.error);
