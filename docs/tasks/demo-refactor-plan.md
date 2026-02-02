# Plan: Refactor and Bug Fix for Demo main.tsx

This plan addresses the refactor of `demo/src/main.tsx` and checks for potential bugs following the rename to `LLMKeyManager`.

## Phase 1: Discovery & Analysis (project-planner & explorer-agent)
1.  **Leftover Reference Scan**: Search the entire codebase (especially demo/ and lib/) for any remaining `AIKeyVault` or `AIKeyVaultProvider` strings.
2.  **Component Integration Audit**: Verify that `KeyListDashboard`, `UsageDashboard`, `ErrorLogs`, and `ValidationNotificationToast` are all correctly consuming the new context.
3.  **Line 28 Analysis**: specifically audit `<KeyListDashboard />` usage. Check if any props (like `className` or layout wrappers) should be passed to improve the UI.

## Phase 2: Implementation (frontend-specialist & backend-specialist)
1.  **Refactor main.tsx**: 
    *   Optimize imports.
    *   Ensure consistent spacing and responsive layout wrappers.
    *   Verify that `LLMKeyManagerProvider` is correctly wrapping all consumer components.
2.  **Fix Leftovers**: Replace any remaining old naming conventions in comments, tests, or minor components.
3.  **Enhance UI Connection**: Ensure that when a key is added/updated in `KeyListDashboard`, the `ChatInterface` (at line 36) immediately reflects the new model availability without page refresh.

## Phase 3: Verification (test-engineer)
1.  **Lint & Type Check**: Run `pnpm lint` to ensure no broken references.
2.  **Live Functional Test**: Verify that adding a key in the dashboard makes it usable in the chat interface.
3.  **Build Verification**: Run `make build` to ensure the demo and library still compile correctly.
