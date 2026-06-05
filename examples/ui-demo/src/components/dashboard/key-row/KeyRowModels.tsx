import React, { useState } from "react";
import { Badge } from "../../ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "llm-key-manager/utils/cn";
import { getModelCapabilities } from "llm-key-manager/services/model-capabilities";
import { ModelCard } from "./ModelCard";
import type {
  KeyMetadata,
  ModelCapability,
  VerifiedModelMetadata,
} from "llm-key-manager";

interface KeyRowModelListProps {
  keyData: KeyMetadata;
  modelStatuses: Record<string, VerifiedModelMetadata>;
  now: number;
  isActive: boolean;
}

/**
 * KeyRowModelList Component
 *
 * Displays the expanded grid of models with filtering.
 * Rendered as a full-width row below the main key row.
 */
export const KeyRowModelList: React.FC<KeyRowModelListProps> = ({
  keyData,
  modelStatuses,
  now,
  isActive,
}) => {
  const [capabilityFilter, setCapabilityFilter] = useState<
    ModelCapability | "all"
  >("all");

  const modelIds = Object.keys(modelStatuses);
  const allModelIds =
    modelIds.length > 0 ? modelIds : keyData.verifiedModels || [];

  const filteredModels =
    capabilityFilter === "all"
      ? allModelIds
      : allModelIds.filter((modelId) =>
        getModelCapabilities(modelId).includes(capabilityFilter)
      );

  return (
    <div
      id={`models-${keyData.id}`}
      className="px-6 pb-6 pt-4 animate-in slide-in-from-top-2 fade-in duration-300 w-full"
    >
      <div className="bg-slate-950/40 rounded-2xl border border-slate-700/30 p-5 shadow-inner">
        {/* Header with Filter */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
              Security Verification Report
            </h4>
            <Badge variant="emerald" size="sm" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black px-2 tracking-widest text-[9px]">
              {filteredModels.length} MODELS ACTIVE
            </Badge>
          </div>
          <select
            value={capabilityFilter}
            onChange={(e) =>
              setCapabilityFilter(e.target.value as ModelCapability | "all")
            }
            className="text-[9px] font-black uppercase tracking-[0.15em] bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-400 cursor-pointer hover:border-slate-500 hover:text-slate-200 transition-all font-mono shadow-sm"
          >
            <option value="all">ALL CAPABILITIES</option>
            <option value="text-chat">💬 CHAT</option>
            <option value="text-reasoning">🧠 REASONING</option>
            <option value="code">💻 CODE</option>
            <option value="image-input">🖼️ VISION</option>
            <option value="image-gen">🎨 IMAGE GEN</option>
            <option value="embedding">📊 EMBEDDING</option>
          </select>
        </div>

        {/* Model Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredModels.map((model) => (
            <ModelCard
              key={model}
              model={model}
              status={modelStatuses[model]}
              isActive={isActive}
              now={now}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface KeyRowStatusButtonProps {
  keyId: string;
  availableCount: number;
  incorrectCount: number;
  totalModels: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

/**
 * KeyRowStatusButton Component
 *
 * The pill button showing summaries (Available / Incorrect / Total).
 * Toggles the expanded view.
 */
export const KeyRowStatusButton: React.FC<KeyRowStatusButtonProps> = ({
  keyId,
  availableCount,
  incorrectCount,
  totalModels,
  isExpanded,
  onToggleExpand,
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggleExpand();
      }}
      className={cn(
        "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 cursor-pointer shadow-sm",
        isExpanded
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)] -translate-y-px"
          : "bg-emerald-500/10 text-emerald-400/90 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:-translate-y-px",
      )}
      aria-expanded={isExpanded}
      aria-controls={`models-${keyId}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40 animate-ping"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"></span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-emerald-400">{availableCount} Available</span>
        {incorrectCount > 0 && (
          <>
            <span className="w-1 h-3 border-r border-slate-700 mx-0.5" />
            <span className="text-rose-500">{incorrectCount} Fail</span>
          </>
        )}
        <span className="w-1 h-3 border-r border-slate-700 mx-0.5" />
        <span className="text-slate-500">{totalModels} Models</span>
      </span>
      {isExpanded ? (
        <ChevronUp className="h-3 w-3 ml-1 text-emerald-500/70" />
      ) : (
        <ChevronDown className="h-3 w-3 ml-1 text-slate-500" />
      )}
    </button>
  );
};
