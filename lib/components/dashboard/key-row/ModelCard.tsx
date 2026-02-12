import React from "react";
import { Terminal, Cpu, Eye, Code as CodeIcon, Zap } from "lucide-react";
import { Progress } from "../../ui";
import { cn } from "../../../utils/cn";
import {
  getModelCapabilities,
  getModelContextWindow,
} from "../../../services/model-capabilities";
import { getModelStatusInfo, formatRetryTime } from "./key-row.utils";
import type { VerifiedModelMetadata } from "../../../models/types";

interface ModelCardProps {
  model: string;
  status: VerifiedModelMetadata | undefined;
  isActive: boolean;
  now: number;
}

/**
 * ModelCard Component
 *
 * Displays a single model with its capabilities and status.
 */
export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  status,
  isActive,
  now,
}) => {
  const capabilities = getModelCapabilities(model);
  const statusInfo = getModelStatusInfo(status?.state, status?.retryCount ?? 0);
  const retryTimeStr = formatRetryTime(status?.nextRetryAt, now);

  return (
    <div className="flex flex-col gap-3 bg-slate-900/60 backdrop-blur-sm p-4 rounded-xl border border-slate-800/50 hover:border-indigo-500/30 hover:bg-slate-900 transition-all duration-300 animate-in fade-in zoom-in-95 group/card shadow-sm">
      {/* Model Name & Capabilities */}
      <div className="flex items-center justify-between gap-4">
        <span
          className="text-[11px] text-slate-300 font-black truncate tracking-tight uppercase"
          title={model}
        >
          {model}
        </span>
        <div className="flex gap-2 shrink-0">
          {capabilities.includes("text-chat") && (
            <span title="Text Chat" className="group-hover/card:scale-110 transition-transform">
              <Terminal className="h-3 w-3 text-slate-500 hover:text-indigo-400" />
            </span>
          )}
          {capabilities.includes("text-reasoning") && (
            <span title="Reasoning" className="group-hover/card:scale-110 transition-transform">
              <Cpu className="h-3 w-3 text-indigo-400/70" />
            </span>
          )}
          {capabilities.includes("code") && (
            <span title="Code" className="group-hover/card:scale-110 transition-transform">
              <CodeIcon className="h-3 w-3 text-emerald-400/70" />
            </span>
          )}
          {capabilities.includes("image-input") && (
            <span title="Vision" className="group-hover/card:scale-110 transition-transform">
              <Eye className="h-3 w-3 text-amber-400/70" />
            </span>
          )}
          {capabilities.includes("image-gen") && (
            <span title="Image Gen" className="group-hover/card:scale-110 transition-transform">
              <Zap className="h-3 w-3 text-purple-400/70" />
            </span>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="w-full space-y-2">
        <Progress
          value={100}
          className="h-1 bg-slate-800 rounded-full overflow-hidden"
          indicatorClassName={isActive ? cn("transition-all duration-500", statusInfo.barColor) : "bg-slate-700"}
        />

        {/* Status Text & Context Window */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <p
              className={cn(
                "text-[9px] font-black uppercase tracking-[0.1em] truncate",
                statusInfo.isCooldown
                  ? "text-amber-500"
                  : statusInfo.isFailed
                    ? "text-rose-500"
                    : "text-emerald-500/80",
              )}
            >
              {statusInfo.statusText}
            </p>
            {statusInfo.isCooldown && retryTimeStr && (
              <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-black animate-pulse">
                {retryTimeStr}
              </span>
            )}
          </div>
          <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-black font-mono border border-slate-700/50">
            {getModelContextWindow(model)}
          </span>
        </div>
      </div>
    </div>
  );
};
