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
    <div className="flex flex-col gap-2 bg-white p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all animate-in fade-in zoom-in-95 duration-200">
      {/* Model Name & Capabilities */}
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] text-slate-700 font-bold truncate pr-2"
          title={model}
        >
          {model}
        </span>
        <div className="flex gap-1.5">
          {capabilities.includes("text-chat") && (
            <span title="Text Chat">
              <Terminal className="h-3 w-3 text-slate-400" />
            </span>
          )}
          {capabilities.includes("text-reasoning") && (
            <span title="Reasoning">
              <Cpu className="h-3 w-3 text-indigo-400" />
            </span>
          )}
          {capabilities.includes("code") && (
            <span title="Code">
              <CodeIcon className="h-3 w-3 text-emerald-400" />
            </span>
          )}
          {capabilities.includes("image-input") && (
            <span title="Vision">
              <Eye className="h-3 w-3 text-amber-400" />
            </span>
          )}
          {capabilities.includes("image-gen") && (
            <span title="Image Gen">
              <Zap className="h-3 w-3 text-purple-400" />
            </span>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="w-full">
        <Progress
          value={100}
          className="h-1 bg-slate-50"
          indicatorClassName={isActive ? statusInfo.barColor : "bg-slate-200"}
        />

        {/* Status Text & Context Window */}
        <div className="flex justify-between items-center mt-1.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <p
              className={cn(
                "text-[8px] font-bold uppercase truncate",
                statusInfo.isCooldown
                  ? "text-amber-500"
                  : statusInfo.isFailed
                    ? "text-red-500"
                    : "text-slate-400",
              )}
            >
              {statusInfo.statusText}
            </p>
            {statusInfo.isCooldown && retryTimeStr && (
              <span className="text-[7px] bg-amber-50 text-amber-600 px-1 py-0.5 rounded border border-amber-100/50 font-bold">
                {retryTimeStr}
              </span>
            )}
          </div>
          <span className="text-[8px] bg-slate-50 text-slate-400 px-1 rounded font-mono">
            {getModelContextWindow(model)}
          </span>
        </div>
      </div>
    </div>
  );
};
