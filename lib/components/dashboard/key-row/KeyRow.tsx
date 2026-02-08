import React, { useState, useEffect } from "react";
import { KeyMetadata, VerifiedModelMetadata } from "../../../models/types";
import { keyRouter } from "../../../services";
import useLLMKeyManager from "../../../hooks/useLLMKeyManager";
import { AlertCircle, Loader2, Clock } from "lucide-react";
import { CheckSquare, Square } from "lucide-react";
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
  const isPrimary = keyRouter.getPromotedKey(keyData.providerId) === keyData.id;
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
        "group relative bg-white transition-all duration-300",
        isExpanded
          ? "shadow-md rounded-xl z-10 border border-indigo-100 my-4"
          : "hover:bg-slate-50/50 border-b border-gray-100 first:rounded-t-lg last:rounded-b-lg last:border-0",
        keyData.isRevoked && "opacity-60 bg-gray-50",
        !isActive && !keyData.isRevoked && "opacity-75 bg-slate-50/30",
        isDeleting && "opacity-50 pointer-events-none scale-[0.98]",
        selected && "bg-indigo-50/40 hover:bg-indigo-50/60",
      )}
    >
      {/* Main Row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Checkbox */}
        <button
          onClick={onSelect}
          className={cn(
            "transition-colors p-1 rounded-md",
            selected ? "text-indigo-600" : "text-gray-300 hover:text-gray-500",
          )}
        >
          {selected ? (
            <CheckSquare className="h-5 w-5" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </button>

        {/* Key Header (Provider, Tier, Label) */}
        <KeyRowHeader
          keyData={keyData}
          isActive={isActive}
          isPrimary={isPrimary}
        />

        {/* Status & Quota Column */}
        <div className="flex-1 min-w-0 flex items-center justify-start gap-6">
          <div className="flex flex-col gap-1 min-w-[120px]">
            {cooldown ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                <Clock className="h-3 w-3 animate-pulse" />
                Ready in {cooldown}s
              </div>
            ) : keyData.verificationStatus === "invalid" && !isExpanded ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider border border-red-100 hover:bg-red-100 transition-colors cursor-pointer"
              >
                <AlertCircle className="h-3 w-3" />
                Invalid
              </button>
            ) : keyData.verificationStatus === "retry_scheduled" &&
              !isExpanded ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <Clock className="h-3 w-3 animate-pulse" />
                Retrying...
              </button>
            ) : keyData.verificationStatus === "testing" || isRefreshing ? (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                <Loader2 className="h-3 w-3 animate-spin" />
                {validationEvent?.type === "validation:model" ? (
                  <>
                    Verifying ({validationEvent.current}/{validationEvent.total}
                    )...
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
                {!!keyData.averageLatency && keyData.averageLatency > 0 && (
                  <span className="text-[10px] font-bold text-slate-400 ml-2">
                    ⚡ {keyData.averageLatency}ms AVG
                  </span>
                )}
              </div>
            ) : (
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100 hover:bg-amber-100 transition-colors"
              >
                <AlertCircle className="h-3 w-3" />
                Untested
              </button>
            )}
          </div>

          {/* Real-time Usage Bars */}
          {hasModels && keyData.rateLimits && (
            <div className="hidden lg:flex flex-col gap-2 w-48">
              {keyData.rateLimits.requests && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Requests</span>
                    <span>
                      {keyData.rateLimits.requests.remaining} /{" "}
                      {keyData.rateLimits.requests.limit}
                    </span>
                  </div>
                  <Progress
                    value={
                      (keyData.rateLimits.requests.remaining /
                        keyData.rateLimits.requests.limit) *
                      100
                    }
                    className="h-1 bg-slate-100"
                    indicatorClassName={
                      keyData.rateLimits.requests.remaining < 5
                        ? "bg-red-500"
                        : "bg-indigo-500"
                    }
                  />
                </div>
              )}
              {keyData.rateLimits.tokens && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Tokens</span>
                    <span>
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
                    className="h-1 bg-slate-100"
                    indicatorClassName="bg-emerald-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date */}
        <div className="text-right w-24 flex-shrink-0 hidden sm:block">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
            Added
          </p>
          <p className="text-xs text-slate-500 font-semibold">
            {formatCreatedDate(keyData.createdAt)}
          </p>
        </div>

        {/* Actions */}
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

      {/* Expanded Details Row */}
      {isExpanded && (
        <KeyRowModelList
          keyData={keyData}
          modelStatuses={modelStatuses}
          now={now}
          isActive={isActive}
        />
      )}
    </div>
  );
};
