# Plan: Model Availability Audit & Verification

This plan outlines the steps for a comprehensive audit and verification of model discovery and availability across all supported providers (OpenAI, Anthropic, Gemini).

## Phase 1: Discovery & Analysis (project-planner & explorer-agent)
1.  **Map Current Source of Truth**: Identify all locations where model lists are maintained (JSON constants, provider adapters, database schema).
2.  **Verify Active Model State**: Query the local IndexedDB (`modelCache` table) to see what models are currently detected and their last verification status.
3.  **Identify Discrepancies**: Compare the discovered models against the updated `models.json` and provider priority lists.

## Phase 2: Logic Verification (backend-specialist)
1.  **Adapter Audit**: Review `completeChat` and `listModels` in all provider adapters to ensure they handle the latest 2025 model IDs correctly (especially `o1`, `o3-mini`, `gemini-2.0`).
2.  **Error Handling Audit**: Ensure `calculateRetry` correctly identifies 404 (Not Found) vs 429 (Rate Limit) to prevent "phantom" models from being retried.
3.  **Optimistic Discovery Check**: Verify that the new "optimistic" discovery (allowing `NEW` models) works correctly in a real-world scenario.

## Phase 3: Testing & Validation (test-engineer)
1.  **Run Provider Tests**: Execute `npx vitest lib/tests/providers/` to ensure adapters can still list models and perform basic chat.
2.  **Run Resilience Tests**: Execute `npx vitest lib/tests/resilience/failover.test.ts` to verify the failover logic works with the updated model lists.
3.  **Perform Live Verification**: Use a dedicated verification script to probe the most critical "flagship" models.

## Phase 4: Final Reporting (orchestrator)
1.  **Synthesize Results**: Combine findings from all agents into a final report.
2.  **Cleanup**: Ensure all speculative model references are removed from docs and UI (if any remain).
