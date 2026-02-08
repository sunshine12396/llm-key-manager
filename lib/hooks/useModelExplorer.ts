import { validatorService } from "../services/validation/validator.service";

export function useModelExplorer() {
  return {
    getAvailableModels:
      validatorService.getAllAvailableModels.bind(validatorService),
    getModelsForKey: validatorService.getModelsForKey.bind(validatorService),
    isModelAvailable: validatorService.isModelAvailable.bind(validatorService),
  };
}
