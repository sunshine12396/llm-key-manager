import { resilientHandler } from '../services/engines/resilience.engine';

export function useKeyHealth() {
    return {
        checkHealth: (keys: any[]) => resilientHandler.getKeysHealth(keys)
    };
}
