import { vaultService } from '../services/vault/vault.service';

export function useVault() {
    return vaultService;
}
