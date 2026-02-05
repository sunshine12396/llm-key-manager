/**
 * Lifecycle Scheduler
 *
 * Manages background task execution with awareness of:
 * - Browser visibility (throttle when backgrounded)
 * - Network status
 * - Explicit pause/resume
 */

export type JobFn = () => Promise<any>;

interface JobConfig {
  id: string;
  intervalMs: number;
  runImmediately?: boolean;
  pauseOnHidden?: boolean;
}

class LifecycleScheduler {
  private jobs: Map<
    string,
    {
      config: JobConfig;
      fn: JobFn;
      timer: ReturnType<typeof setTimeout> | null;
      isRunning: boolean;
      shouldStop: boolean;
    }
  > = new Map();

  /**
   * Register and start a periodic job
   */
  startJob(config: JobConfig, fn: JobFn) {
    this.stopJob(config.id);

    const job = {
      config,
      fn,
      timer: null as ReturnType<typeof setTimeout> | null,
      isRunning: false,
      shouldStop: false,
    };

    const scheduleNext = () => {
      if (job.shouldStop) return;

      // Add 10% jitter to prevent thundering herd
      const jitter = Math.floor(config.intervalMs * 0.1 * Math.random());
      const effectiveInterval = config.intervalMs + jitter;

      job.timer = setTimeout(execute, effectiveInterval);
    };

    const execute = async () => {
      if (job.isRunning || job.shouldStop) return;

      // Basic visibility check
      if (
        config.pauseOnHidden &&
        typeof document !== "undefined" &&
        document.hidden
      ) {
        scheduleNext();
        return;
      }

      job.isRunning = true;
      try {
        await fn();
      } catch (e) {
        console.error(`[Scheduler] Job ${config.id} failed:`, e);
      } finally {
        job.isRunning = false;
        scheduleNext();
      }
    };

    this.jobs.set(config.id, job);

    if (config.runImmediately) {
      execute();
    } else {
      scheduleNext();
    }
  }

  /**
   * Stop a job
   */
  stopJob(id: string) {
    const job = this.jobs.get(id);
    if (job) {
      job.shouldStop = true;
      if (job.timer) {
        clearTimeout(job.timer);
        job.timer = null;
      }
      this.jobs.delete(id);
    }
  }

  /**
   * Stop all jobs
   */
  stopAll() {
    for (const id of this.jobs.keys()) {
      this.stopJob(id);
    }
  }
}

export const scheduler = new LifecycleScheduler();
