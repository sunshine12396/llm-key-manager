# Plan: Final Model Availability Verification & Registry Update

This plan focuses on verifying the final model registry against the latest 2026 provider specs and ensuring the "Optimistic Discovery" logic is fully integrated.

## Phase 1: Registry Audit (project-planner & explorer-agent)
1.  **Sanity Check Registry**: Review `lib/constants/models.json` against current industry standards for OpenAI (o1/o3), Anthropic (Claude 3.5), and Gemini (2.0).
2.  **Verify Aliases**: Ensure `smart`, `fast`, `coding`, and `reasoning` aliases point to the absolute best current versions.
3.  **Check Pricing/Limits**: Verify `pricing.json` and `limits.json` are consistent with the newly added models.

## Phase 2: Logic Hardening (backend-specialist)
1.  **Provider Handlers**: Double-check OpenAI and Gemini adapters for any residual "future-proof" logic that might cause 404s (e.g., checking for `o4`).
2.  **Discovery Resilience**: Ensure the `BackgroundValidatorJob` correctly promotes `NEW` models to `AVAILABLE` on the first successful request.
3.  **Error Classification**: Review `ModelStateMachine.classifyError` to ensure it distinguishes between "Model Not Found" (permanent) and "Overloaded" (temporary).

## Phase 3: Final Verification (test-engineer)
1.  **Full Suite run**: Execute `npx vitest --run` to ensure 100% pass rate.
2.  **Model discovery test**: Create a targeted test to verify that a new, unlisted model can be automatically discovered and used.
3.  **Build Audit**: Run `make build` and check for any dynamic import warnings.

## Phase 4: Reporting (orchestrator)
1.  **Synthesize Report**: Provide a definitive list of supported models.
2.  **Documentation finalization**: Sync `docs/features/models.md` with the final JSON state.
