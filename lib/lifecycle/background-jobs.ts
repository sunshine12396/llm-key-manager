/**
 * Background Jobs Orchestrator
 *
 * Central registry for all async background lifecycles.
 */

import { scheduler } from "./scheduler";
import { validatorJob } from "./validator.job";

class BackgroundJobsManager {
  private static instance: BackgroundJobsManager;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): BackgroundJobsManager {
    if (!BackgroundJobsManager.instance) {
      BackgroundJobsManager.instance = new BackgroundJobsManager();
    }
    return BackgroundJobsManager.instance;
  }

  /**
   * Start all background services
   */
  async start() {
    if (this.isInitialized) {
      console.log("[BackgroundJobs] Already initialized, skipping...");
      return;
    }
    this.isInitialized = true;

    console.log("[BackgroundJobs] Initializing lifecycle services...");

    // 1. Resume any interrupted validations from last session
    await validatorJob.resumePendingValidations();

    // 2. Schedule the Model Recovery Job
    // Retries unavailable models every 5 minutes
    scheduler.startJob(
      {
        id: "model-recovery",
        intervalMs: 5 * 60 * 1000,
        runImmediately: true,
        pauseOnHidden: true,
      },
      async () => {
        const result = await validatorJob.retryUnavailableModels();
        if (result.recovered > 0) {
          console.log(
            `[BackgroundJobs] Recovered ${result.recovered} models during periodic check.`,
          );
        }
      },
    );

    // 3. Listen for Visibility API - run immediate check when tab becomes visible
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", async () => {
        if (document.hidden) {
          console.log(
            "[BackgroundJobs] Tab hidden, background tasks will pause on next cycle.",
          );
        } else {
          console.log(
            "[BackgroundJobs] Tab visible, triggering immediate recovery check...",
          );
          // Trigger model recovery immediately when user returns
          try {
            const result = await validatorJob.retryUnavailableModels();
            if (result.recovered > 0) {
              console.log(
                `[BackgroundJobs] Visibility recovery: ${result.recovered} models restored.`,
              );
            }
          } catch (e) {
            console.warn("[BackgroundJobs] Visibility recovery failed:", e);
          }
        }
      });
    }
  }

  /**
   * Stop all background services
   */
  stop() {
    console.log("[BackgroundJobs] Stopping all lifecycle services...");
    scheduler.stopAll();
    this.isInitialized = false;
  }
}

export const backgroundJobs = BackgroundJobsManager.getInstance();

// Re-export specific jobs for convenience
export { validatorJob };
