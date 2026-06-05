import React from "react";
import {
  Terminal,
  Cpu,
  Eye,
  Code2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

import { Progress } from "../../ui";
import { cn } from "llm-key-manager/utils/cn";

import { getModelCapabilities } from "llm-key-manager/services/model-capabilities";
import { modelDataService } from "llm-key-manager/services/model-data.service";

import {
  getModelStatusInfo,
  formatRetryTime,
} from "./key-row.utils";

import type { VerifiedModelMetadata } from "llm-key-manager";

interface ModelCardProps {
  model: string;
  status: VerifiedModelMetadata | undefined;
  isActive: boolean;
  now: number;
}

const capabilityStyles: Record<string, string> = {
  "text-chat":
    "bg-slate-800/80 text-slate-300 border-slate-700/50",
  "text-reasoning":
    "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  code:
    "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  "image-input":
    "bg-amber-500/10 text-amber-300 border-amber-500/20",
  "image-gen":
    "bg-purple-500/10 text-purple-300 border-purple-500/20",
};

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  status,
  isActive,
  now,
}) => {
  const capabilities = getModelCapabilities(model);

  const statusInfo = getModelStatusInfo(
    status?.state,
    status?.retryCount ?? 0,
  );

  const retryTimeStr = formatRetryTime(
    status?.nextRetryAt,
    now,
  );

  const statusIcon = statusInfo.isCooldown ? (
    <AlertTriangle className="h-3.5 w-3.5" />
  ) : statusInfo.isFailed ? (
    <XCircle className="h-3.5 w-3.5" />
  ) : (
    <CheckCircle2 className="h-3.5 w-3.5" />
  );

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all duration-300",
        "bg-linear-to-b from-slate-900 to-slate-950",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
        "hover:-translate-y-1 hover:shadow-2xl",
        isActive
          ? "border-indigo-500/30"
          : "border-slate-800/80",
      )}
    >
      {/* Glow Effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              title={model}
              className="truncate text-sm font-bold tracking-tight text-white"
            >
              {model}
            </h3>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {capabilities.includes("text-chat") && (
                <CapabilityBadge
                  icon={<Terminal className="h-3 w-3" />}
                  label="Chat"
                  className={capabilityStyles["text-chat"]}
                />
              )}

              {capabilities.includes("text-reasoning") && (
                <CapabilityBadge
                  icon={<Cpu className="h-3 w-3" />}
                  label="Reasoning"
                  className={capabilityStyles["text-reasoning"]}
                />
              )}

              {capabilities.includes("code") && (
                <CapabilityBadge
                  icon={<Code2 className="h-3 w-3" />}
                  label="Code"
                  className={capabilityStyles.code}
                />
              )}

              {capabilities.includes("image-input") && (
                <CapabilityBadge
                  icon={<Eye className="h-3 w-3" />}
                  label="Vision"
                  className={capabilityStyles["image-input"]}
                />
              )}

              {capabilities.includes("image-gen") && (
                <CapabilityBadge
                  icon={<Sparkles className="h-3 w-3" />}
                  label="Image"
                  className={capabilityStyles["image-gen"]}
                />
              )}
            </div>
          </div>

          {/* Context Window */}
          <div className="rounded-lg border border-slate-700/60 bg-slate-800/60 px-2 py-1">
            <span className="text-[10px] font-semibold tracking-wide text-slate-300">
              {modelDataService.getContextWindow(model)}
            </span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-3">
          <Progress
            value={100}
            className="h-1.5 rounded-full bg-slate-800"
            indicatorClassName={cn(
              "transition-all duration-500",
              isActive
                ? statusInfo.barColor
                : "bg-slate-700",
            )}
          />

          {/* Status */}
          <div className="flex items-center justify-between gap-3">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs font-semibold",
                statusInfo.isCooldown &&
                "border-amber-500/20 bg-amber-500/10 text-amber-300",
                statusInfo.isFailed &&
                "border-rose-500/20 bg-rose-500/10 text-rose-300",
                !statusInfo.isCooldown &&
                !statusInfo.isFailed &&
                "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {statusIcon}
              <span>{statusInfo.statusText}</span>
            </div>

            {statusInfo.isCooldown && retryTimeStr && (
              <span className="text-[10px] font-medium text-amber-400">
                Retry in {retryTimeStr}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CapabilityBadgeProps {
  icon: React.ReactNode;
  label: string;
  className?: string;
}

function CapabilityBadge({
  icon,
  label,
  className,
}: CapabilityBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1",
        "text-[10px] font-semibold transition-transform duration-200",
        "group-hover:scale-[1.02]",
        className,
      )}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}