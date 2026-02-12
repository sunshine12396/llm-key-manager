/**
 * Key Row Utilities
 *
 * Helper functions for KeyRow component formatting and logic.
 */

// ============================================
// BADGE VARIANTS
// ============================================

type BadgeVariant = "red" | "slate" | "indigo" | "emerald" | "amber";

export function getPriorityBadgeVariant(priority?: string): BadgeVariant {
  switch (priority) {
    case "high":
      return "red";
    case "low":
      return "slate";
    default:
      return "indigo";
  }
}

export function getProviderBadgeVariant(provider: string): BadgeVariant {
  const p = provider.toLowerCase();
  if (p.includes("openai")) return "emerald";
  if (p.includes("anthropic")) return "amber";
  if (p.includes("gemini") || p.includes("google")) return "indigo";
  return "slate";
}

// ============================================
// STATUS FORMATTING
// ============================================

export interface ModelStatusInfo {
  barColor: string;
  statusText: string;
  isCooldown: boolean;
  isFailed: boolean;
  isChecking: boolean;
}

export function getModelStatusInfo(
  state: string | undefined,
  retryCount: number = 0,
): ModelStatusInfo {
  const isCooldown = state === "COOLDOWN";
  const isFailed = state === "PERM_FAILED";
  const isChecking = state === "CHECKING" || state === "NEW";

  let barColor = "bg-slate-700";
  let statusText = "Pending...";

  if (state === "AVAILABLE") {
    barColor = "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]";
    statusText = "Ready";
  } else if (state === "AVAILABLE") {
    // Duplicate check removed, keeping just one
    barColor = "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]";
    statusText = "Ready";
  } else if (isCooldown) {
    barColor = "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
    statusText = `Cooldown (Retry ${retryCount})`;
  } else if (isFailed) {
    barColor = "bg-red-500";
    statusText = "Failed (Reached Max Retries)";
  } else if (isChecking) {
    barColor = "bg-indigo-500 animate-pulse";
    statusText = "Checking";
  }

  return { barColor, statusText, isCooldown, isFailed, isChecking };
}

// ============================================
// TIME FORMATTING
// ============================================

export function formatRetryTime(
  nextRetryAt: number | null | undefined,
  now: number,
): string {
  if (!nextRetryAt) return "";

  const nextRetryMs = nextRetryAt - now;
  if (nextRetryMs <= 0) return "";
  if (nextRetryMs >= 3600000) return ""; // More than 1 hour, don't show

  if (nextRetryMs < 60000) {
    return `${Math.ceil(nextRetryMs / 1000)}S`;
  }
  return `${Math.ceil(nextRetryMs / 60000)}M`;
}

export function formatCooldownTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
}

// ============================================
// DATE FORMATTING
// ============================================

export function formatCreatedDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
