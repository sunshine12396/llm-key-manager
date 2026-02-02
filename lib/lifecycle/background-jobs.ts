/**
 * Background Jobs Orchestrator
 *
 * Central registry for all async background lifecycles.
 */

import { scheduler } from "./scheduler";
import { validatorJob } from "./validator.job";

class BackgroundJobsManager {
  private isInitialized = false;

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
        intervalMs: 5 * 60 * 1000, // Every 5 minutes (was 1h)
        runImmediately: true,
        pauseOnHidden: true, // Optimization: Don't waste API calls if user isn't looking
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
  }
}

export const backgroundJobs = new BackgroundJobsManager();

// Re-export specific jobs for convenience
export { validatorJob };
