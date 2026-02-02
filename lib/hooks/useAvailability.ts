import { useState, useEffect } from "react";
import { availabilityManager } from "../services/availability";
import { AIProviderId, VerifiedModelMetadata } from "../models/types";

export interface AvailabilityStats {
  total: number;
  available: number;
  temporaryFailed: number;
  permanentFailed: number;
  byProvider: Record<AIProviderId, { total: number; available: number }>;
}

export function useAvailability() {
  const [stats, setStats] = useState<AvailabilityStats | null>(null);

  const refreshStats = async () => {
    const currentStats = await availabilityManager.getStats();
    setStats(currentStats);
  };

  /**
   * Get details for a specific key
   */
  const getKeyModelDetails = async (
    keyId: string,
  ): Promise<VerifiedModelMetadata[]> => {
    // We'll use the internal method exposed via service
    // Since getModelsForKey is just a wrapper around db, we can use it
    return availabilityManager.getModelsForKey(keyId);
  };

  /**
   * Force retry a specific model
   */
  const retryModel = async (keyId: string, modelId: string) => {
    await availabilityManager.triggerModelRevalidation(keyId, modelId);
    await refreshStats();
  };

  useEffect(() => {
    refreshStats();
    // Poll every 5 seconds for UI updates
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return {
    stats,
    refreshStats,
    getKeyModelDetails,
    retryModel,
  };
}
