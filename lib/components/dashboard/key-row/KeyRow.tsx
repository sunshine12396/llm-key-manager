import React, { useState, useEffect } from "react";
import { KeyMetadata, VerifiedModelMetadata } from "../../../models/types";
import { availabilityManager } from "../../../services";
import useLLMKeyManager from "../../../hooks/useLLMKeyManager";
import { AlertCircle, Loader2, Clock } from "lucide-react";
import { Progress } from "../../ui";
import { cn } from "../../../utils/cn";
import { KeyRowHeader } from "./KeyRowHeader";
import { KeyRowActions } from "./KeyRowActions";
import { KeyRowModelList, KeyRowStatusButton } from "./KeyRowModels";
import { formatCreatedDate } from "./key-row.utils";

interface KeyRowProps {
  keyData: KeyMetadata;
  selected: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}

/**
 * KeyRow Component
 *
 * Displays a single API key with its status, models, and actions.
 * Refactored to use subcomponents for better maintainability.
 */
export const KeyRow: React.FC<KeyRowProps> = ({
  keyData,
  selected,
  isDeleting,
  onSelect,
  onDelete,
  onRefresh,
  onEdit,
  onToggleActive,
}) => {
  const isActive = keyData.isEnabled !== false;
  const isPrimary = availabilityManager.getPromotedKey(keyData.providerId) === keyData.id;
  const { validationEvents } = useLLMKeyManager();
  const validationEvent = validationEvents.find(
    (e: any) => e.keyId === keyData.id,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasModels =
    (keyData.verifiedModels && keyData.verifiedModels.length > 0) ||
    (keyData.verifiedModelsMeta && keyData.verifiedModelsMeta.length > 0);

  const [isExpanded, setIsExpanded] = useState(false);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [modelStatuses, setModelStatuses] = useState<
    Record<string, VerifiedModelMetadata>
  >(() => {
    const initial: Record<string, VerifiedModelMetadata> = {};
    if (keyData.verifiedModelsMeta) {
      keyData.verifiedModelsMeta.forEach((m) => (initial[m.modelId] = m));
    }
    return initial;
  });

  // Derived counts
  const modelIds = Object.keys(modelStatuses);

  // Available count: if we have detailed status, check 'AVAILABLE'.
  // Otherwise, fallback to the length of legacy 'verifiedModels' list (assumed working).
  const availableCount =
    modelIds.length > 0
      ? Object.values(modelStatuses).filter((m) => m.state === "AVAILABLE")
        .length
      : keyData.verifiedModels?.length || 0;

  const incorrectCount = Object.values(modelStatuses).filter(
    (m) => m.state === "PERM_FAILED" || m.state === "TEMP_FAILED",
  ).length;

  const allModelIds =
    modelIds.length > 0 ? modelIds : keyData.verifiedModels || [];

  const totalModels = allModelIds.length;

  // Global 'now' for all model-level timers
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Update statuses when prop updates
  useEffect(() => {
    if (keyData.verifiedModelsMeta) {
      setModelStatuses((prev) => {
        const next = { ...prev };
        keyData.verifiedModelsMeta!.forEach((m) => (next[m.modelId] = m));
        return next;
      });
    }
  }, [keyData.verifiedModelsMeta]);

  // Fetch detailed model statuses on mount and when keyId changes
  useEffect(() => {
    if (keyData.id) {
      import("../../../services/availability").then(
        ({ availabilityManager }) => {
          availabilityManager.getModelsForKey(keyData.id).then((models) => {
            const statusMap: Record<string, VerifiedModelMetadata> = {};
            models.forEach((m) => (statusMap[m.modelId] = m));
            setModelStatuses(statusMap);
          });
        },
      );
    }
  }, [keyData.id]);

  // Handle expansion - we already fetch on mount, but could re-fetch here if needed
  // For now, the mount fetch + background updates (via prop changes) should be enough

  // Cooldown timer logic
  useEffect(() => {
    if (!keyData.retryAfter) {
      setCooldown(null);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const diff = Math.ceil((keyData.retryAfter! - now) / 1000);
      if (diff <= 0) {
        setCooldown(null);
      } else {
        setCooldown(diff);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [keyData.retryAfter]);

  // Handlers
  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(keyData.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative bg-slate-900 transition-all duration-300 overflow-hidden",
        isExpanded
          ? "shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-xl z-10 border border-slate-700/50 my-4 bg-slate-800/80 backdrop-blur-md"
          : "hover:bg-slate-800/40 border-b border-slate-800/50 first:rounded-t-lg last:rounded-b-lg last:border-0",
        keyData.isRevoked && "opacity-60 bg-slate-950",
        !isActive && !keyData.isRevoked && "opacity-75 bg-slate-900/50",
        isDeleting && "opacity-50 pointer-events-none scale-[0.98]",
        selected && "bg-indigo-500/5 border-indigo-500/20",
      )}
    >
      {/* Left Status Glow Strip */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 transition-all duration-300",
          keyData.verificationStatus === "valid" ? "bg-emerald-500 shadow-[2px_0_8px_rgba(16,185,129,0.3)]" :
            keyData.verificationStatus === "testing" ? "bg-indigo-500 animate-pulse" :
              keyData.verificationStatus === "invalid" ? "bg-red-500" : "bg-slate-700"
        )}
      />

      {/* Main Row */}
      <div className="flex items-center gap-4 px-6 py-4.5">
        {/* Checkbox with custom style */}
        <button
          onClick={onSelect}
          className={cn(
            "transition-all duration-200 p-0.5 rounded-md flex items-center justify-center border-2 shrink-0",
            selected
              ? "bg-indigo-500 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]"
              : "border-slate-700 text-transparent hover:border-slate-500 group-hover:border-slate-600"
          )}
        >
          <div className={cn(
            "h-3.5 w-3.5 border-b-2 border-r-2 border-white rotate-45 transform -translate-y-[1px]",
            !selected && "hidden"
          )} />
        </button>

        {/* Key Header (Provider, Tier, Label) */}
        <KeyRowHeader
          keyData={keyData}
          isActive={isActive}
          isPrimary={isPrimary}
        />

        {/* Status & Quota Column */}
        <div className="flex-1 min-w-0 flex items-center justify-start gap-8">
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            {cooldown ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.1)]">
                <Clock className="h-3 w-3 animate-pulse" />
                Ready in {cooldown}s
              </div>
            ) : keyData.verificationStatus === "invalid" && !isExpanded ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-500/20 hover:bg-red-500/20 transition-all shadow-[0_0_12px_rgba(239,68,68,0.1)] group/btn"
              >
                <AlertCircle className="h-3 w-3 group-hover/btn:scale-110 transition-transform" />
                Invalid
              </button>
            ) : keyData.verificationStatus === "retry_scheduled" &&
              !isExpanded ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/20 hover:bg-amber-500/20 transition-all group/btn"
              >
                <Clock className="h-3 w-3 animate-pulse" />
                Retrying...
              </button>
            ) : keyData.verificationStatus === "testing" || isRefreshing ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                {validationEvent?.type === "validation:model" ? (
                  <>
                    Verifying ({(validationEvent as any).current}/{(validationEvent as any).total})
                  </>
                ) : (
                  "Verifying..."
                )}
              </div>
            ) : hasModels || isExpanded ? (
              <div className="flex flex-col items-start gap-1">
                <KeyRowStatusButton
                  keyId={keyData.id}
                  availableCount={availableCount}
                  incorrectCount={incorrectCount}
                  totalModels={totalModels}
                  isExpanded={isExpanded}
                  onToggleExpand={() => setIsExpanded(!isExpanded)}
                />
                {!!keyData?.averageLatency && keyData.averageLatency > 0 && (
                  <span className="text-[9px] font-black text-slate-500/80 ml-2.5 uppercase tracking-tighter flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {keyData.averageLatency}ms AVG
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-700/50 text-slate-400 text-[10px] font-black uppercase tracking-widest border border-slate-600/50 hover:bg-slate-700 transition-all"
              >
                <AlertCircle className="h-3 w-3" />
                Untested
              </button>
            )}
          </div>

          {/* Real-time Usage Bars */}
          {hasModels && keyData?.rateLimits && (
            <div className="hidden xl:flex flex-col gap-3 w-56">
              {keyData.rateLimits?.requests && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    <span>Requests</span>
                    <span className="text-slate-400">
                      {keyData.rateLimits.requests.remaining.toLocaleString()} /{" "}
                      {keyData.rateLimits.requests.limit.toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={
                      (keyData.rateLimits.requests.remaining /
                        keyData.rateLimits.requests.limit) *
                      100
                    }
                    className="h-1.5 bg-slate-800 rounded-full"
                    indicatorClassName={cn(
                      "transition-all duration-1000 ease-out",
                      keyData.rateLimits.requests.remaining / keyData.rateLimits.requests.limit < 0.2
                        ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                        : "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                    )}
                  />
                </div>
              )}
              {keyData.rateLimits?.tokens && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    <span>Tokens</span>
                    <span className="text-slate-400">
                      {Math.round(keyData.rateLimits.tokens.remaining / 1000)}k
                      / {Math.round(keyData.rateLimits.tokens.limit / 1000)}k
                    </span>
                  </div>
                  <Progress
                    value={
                      (keyData.rateLimits.tokens.remaining /
                        keyData.rateLimits.tokens.limit) *
                      100
                    }
                    className="h-1.5 bg-slate-800 rounded-full"
                    indicatorClassName="bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)] transition-all duration-1000 ease-out"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date */}
        <div className="text-right w-28 flex-shrink-0 hidden md:block">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">
            Added
          </p>
          <p className="text-[11px] text-slate-400 font-bold font-mono">
            {formatCreatedDate(keyData.createdAt)}
          </p>
        </div>

        {/* Actions */}
        <div className="pl-4 border-l border-slate-800/50">
          <KeyRowActions
            keyId={keyData.id}
            isActive={isActive}
            isRefreshing={isRefreshing}
            onToggleActive={onToggleActive}
            onRefresh={handleRefresh}
            onCopyId={handleCopyId}
            onEdit={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onDelete={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            isCopied={copied}
          />
        </div>
      </div>

      {/* Expanded Details Row */}
      {isExpanded && (
        <div className="border-t border-slate-700/30 bg-slate-900/40">
          <KeyRowModelList
            keyData={keyData}
            modelStatuses={modelStatuses}
            now={now}
            isActive={isActive}
          />
        </div>
      )}
    </div>
  );
};
