# PLAN: Developer Playground & Testing Ground

## Objective
Enhance the existing `ui-demo` to serve as a comprehensive **Testing Ground** to verify all core features of the `llm-key-manager` (Resilience, Safety, Routing) and act as an **Integration Template** for developers to copy code snippets.

## Context
The project has 6 mature features (Vault, Discovery, Routing, Resilience, Analytics, Safety). While the `ui-demo` has basic chat and analytics, it currently lacks a dedicated testing area for developers to intentionally trigger edge cases (like rate limits) and a reference area to copy setup code.

## Implementation Steps

### Phase 1: Planning & Documentation (Current)
1. Write the implementation plan (`docs/plan/PLAN-ui-playground.md`).
2. Document the UI Demo as a core feature in `docs/features/07-ui-demo/README.md`.

### Phase 2: Building the Developer Playground Component
1. Finalize `DeveloperPlayground.tsx` (already drafted).
2. Add an **Integration Snippets** viewer with tabs for Setup, Usage, and Safety integration code.
3. Add a **Feature Testing** panel to instruct users on how to force Circuit Breakers or test Auto-failover manually.

### Phase 3: Wiring & Tab Integration
1. Update `src/components/index.ts` to export the new Playground component.
2. Update `App.tsx` to include a new "Testing Ground" tab in the main navigation and make it the default landing surface.
3. Verify Vite HMR updates correctly in the browser.
