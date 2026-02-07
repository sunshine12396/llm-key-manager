import { backgroundValidator } from '../services';

export function useModelExplorer() {
    return {
        getAvailableModels: backgroundValidator.getAllAvailableModels.bind(backgroundValidator),
        getModelsForKey: backgroundValidator.getModelsForKey.bind(backgroundValidator),
        isModelAvailable: backgroundValidator.isModelAvailable.bind(backgroundValidator)
    };
}
