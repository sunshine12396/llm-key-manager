# 🗝️ AI Key Manager (Client-Only)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Privacy: Guaranteed](https://img.shields.io/badge/Privacy-Guaranteed-green.svg)](#security)
[![Client-Only: True](https://img.shields.io/badge/Client--Only-True-blue.svg)](#-architecture)

**A secure, browser-native library for resilient LLM integration.** Manage multiples keys, handle failovers, and optimize costs—without a backend.

---

## 🚀 Why AI Key Manager?

Integrating LLMs is easy, but managing **multiple keys**, **rate limits**, and **provider outages** is hard. AI Key Manager abstracts these complexities into a single, unified interface that runs entirely in your user's browser.

-   **Zero Backend Required**: Hardened security using Web Crypto API.
-   **Multi-Provider**: Unified support for **Google Gemini**, **OpenAI**, and **Anthropic**.
-   **Smart Failover**: Automatically switches keys on 429 (Rate Limit) or provider outages.
-   **Cost Optimized**: Intelligent routing based on key priority and model tiers.

---

## ✨ Core Capabilities

### 🛡️ [Hardened Security](./docs/features/security.md)
API keys are encrypted using **AES-256-GCM** before being saved to IndexedDB. They never leave the client.

### 🚦 [Smart Routing](./docs/features/routing.md)
A sophisticated routing engine that factors in key health, model priority, and specific capabilities.

### 🔍 [Autodiscovery](./docs/features/discovery.md)
Automatically detects which models a key can access and monitors health in the background.

### 🧠 [Logical Aliases](./docs/features/models.md)
Stop hardcoding model version strings. Use `fast`, `smart`, or `coding` and let the manager resolve the best available model.

---

## 🛠️ Quick Start (Local Development)

This project is currently in active development and not yet published to npm. You can integrate it by cloning the repository.

### 1. Setup

```bash
# Clone the repository
git clone https://github.com/sunshine12396/llm-key-manager.git
cd llm-key-manager

# Install dependencies
pnpm install

# Build the library
pnpm build:lib
```

---

## 🛠️ Development Commands

This project uses a `Makefile` to simplify common development tasks.

| Command | Description |
| :--- | :--- |
| `make setup` | Initial project setup (installs dependencies). |
| `make dev` | Starts the development server for the /demo application. |
| `make build` | Builds the library for production (`/dist`). |
| `make test` | Runs the test suite (Vitest). |
| `make lint` | Runs TypeScript type checking. |
| `make clean` | Removes build artifacts and `node_modules`. |
| `make rebuild` | Full clean start: `clean` + `install` + `build`. |

---

### 2. Integration Guide

Since this library is designed as a source-code module (similar to shadcn/ui), you integrate it by copying the core files directly into your project.

#### Step 1: Copy the Library
Copy the `lib/` directory from this repository into your project's source folder (e.g., `src/lib/llm-key-manager`).

#### Step 2: Install Dependencies
The library relies on several core packages for provider SDKs, database management, and utilities. Install them using your package manager:

```bash
# Core dependencies
npm install @anthropic-ai/sdk @google/generative-ai openai dexie uuid zod clsx tailwind-merge lucide-react

# Type definitions
npm install -D @types/uuid
```

#### Step 3: Usage (React)
Now you can import the hooks and services directly in your application.

```tsx
import { useLLM, vault } from '@/lib/llm-key-manager';

function App() {
  const { chat, isLoading } = useLLM();

  const handlePrompt = async () => {
    // 1. Add a key (usually via a UI form)
    await vault.addKey('openai', 'sk-...', 'Primary Key', 'high');

    // 2. Chat using a logical alias
    const response = await chat({
      model: 'fast',
      messages: [{ role: 'user', content: 'Explain quantum physics simply.' }]
    });

    console.log(response.content);
  };

  return <button onClick={handlePrompt}>Send Message</button>;
}
```

### 3. Direct Usage (Non-React)

```typescript
import { llmClient, vault } from '@/lib/llm-key-manager';

// Unlock the vault
await vault.unlock('optional-passphrase');

// Execute request with automatic failover
const result = await llmClient.chat({
    model: 'gpt-4o',
    messages: [...]
});
```

---

## 📖 Documentation

-   [**Security & Privacy**](./docs/features/security.md) - How we protect your data.
-   [**Smart Routing & Failover**](./docs/features/routing.md) - Deep dive into key selection.
-   [**Discovery & Health**](./docs/features/discovery.md) - The state machine and validation.
-   [**Model Management**](./docs/features/models.md) - Aliases and Fallback chains.
-   [**UI Components**](./docs/features/ui-components.md) - Drop-in dashboards and hooks.

---

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.
