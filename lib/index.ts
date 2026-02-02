/**
 * LLM Key Manager - Public API Entry Point
 *
 * This is the ONLY file that should be imported by consumer applications.
 * It exposes stable, versioned interfaces and maintains the project"s invariants.
 */

// 1. Core APIs
export { llmClient } from "./public/llm";
export { vault } from "./public/vault";

// 2. React Hooks
export * from "./public/hooks";

// 3. Stable Types
export * from "./public/types";

// 4. UI Components
export {
  LLMKeyManagerProvider,
  useLLMKeyManager,
} from "./components/core/LLMKeyManagerProvider";
export { ValidationNotificationToast } from "./components/notifications/ValidationNotificationToast";
export { KeyListDashboard } from "./components/dashboard/KeyListDashboard";
export { UsageDashboard } from "./components/dashboard/UsageDashboard";
export { ErrorLogs } from "./components/dashboard/ErrorLogs";
export { AddKeyForm } from "./components/forms/AddKeyForm";
export { EditKeyModal } from "./components/forms/EditKeyModal";

