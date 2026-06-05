# Feature 7: UI Testing Ground & Demo

> **Phase:** 6 (Developer Experience) · **Status:** 🚧 In Progress

## Purpose

The UI Demo provides a complete React application serving two distinct purposes:
1. **Testing Ground:** A comprehensive interface to visually verify all six core features (Vault, Discovery, Routing, Resilience, Analytics, Safety Guard) in real-time.
2. **Integration Template:** A developer-friendly reference containing exact code snippets on how to initialize the library, wrap the React context, and utilize the client hooks.

## Key Features

### 1. Testing Ground Tab
- Single entry point for live verification of Vault, Discovery, Routing, Resilience, Analytics, and Safety behavior.
- Integration snippet viewer for `setup`, `chat`, `safety`, and `analytics`.
- Quick actions to force fallback models, freeze/resume scanning, toggle emergency mode, and generate sample analytics events.

### 2. Interactive Vault Dashboard
- Real-time display of all stored keys and their metadata.
- CRUD operations for API keys securely stored in IndexedDB.
- Verification status indicating capability discovery success or failure.

### 3. Observability & Safety Overviews
- **Analytics Dashboard**: Tracks total token usage, estimated costs, and visualizes hourly usage breakdowns.
- **Safety Control Surface**: Displays circuit breaker statuses (e.g., how many keys/providers are temporarily blocked due to excessive errors) and allows forcing an emergency fallback model.
- Live event chips in the header surface the latest safety transition, forced fallback, and block counts.

## Architecture

The Demo is built using **Vite**, **React**, and **Tailwind CSS**. It connects to the `llm-key-manager` via the `LLMKeyManagerProvider` wrapper and the custom `useLLMKeyManager` hook. The default landing tab is **Testing Ground** so developers can immediately exercise the safety, analytics, and routing flows.

## Quick Start

```bash
cd examples/ui-demo
pnpm install
CHOKIDAR_USEPOLLING=true pnpm run dev
```
