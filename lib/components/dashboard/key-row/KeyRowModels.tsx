import React, { useState } from "react";
import { Badge } from "../../ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../../utils/cn";
import { filterModelsByCapability } from "../../../services/model-capabilities";
import { getLLMKeyManagerConfig } from "../../../config";
import { ModelCard } from "./ModelCard";
import type {
  KeyMetadata,
  ModelCapability,
  VerifiedModelMetadata,
} from "../../../models/types";

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
  const config = getLLMKeyManagerConfig();
  const [capabilityFilter, setCapabilityFilter] = useState<
    ModelCapability | "all"
  >(config.defaultCapabilityFilter || "all");

  const modelIds = Object.keys(modelStatuses);
  const allModelIds =
    modelIds.length > 0 ? modelIds : keyData.verifiedModels || [];

  const filteredModels =
    capabilityFilter === "all"
      ? allModelIds
      : filterModelsByCapability(allModelIds, capabilityFilter);

  return (
    <div
      id={`models-${keyData.id}`}
      className="px-5 pb-5 pt-0 animate-in slide-in-from-top-2 fade-in duration-300 w-full"
    >
      <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-4">
        {/* Header with Filter */}
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
            Verified Models
            <Badge variant="slate" size="sm" className="bg-white">
              {filteredModels.length}
            </Badge>
          </h4>
          <select
            value={capabilityFilter}
            onChange={(e) =>
              setCapabilityFilter(e.target.value as ModelCapability | "all")
            }
            className="text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-600 cursor-pointer hover:border-indigo-200 transition-all font-mono"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onToggleExpand();
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
        isExpanded
          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
          : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100",
      )}
      aria-expanded={isExpanded}
      aria-controls={`models-${keyId}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      {availableCount} Available
      {incorrectCount > 0 && (
        <>
          <span className="opacity-20 mx-1">/</span>
          <span className="text-red-600">{incorrectCount} Incorrect</span>
        </>
      )}
      <span className="opacity-20 mx-1">/</span>
      <span>{totalModels} Models</span>
      {isExpanded ? (
        <ChevronUp className="h-3 w-3 ml-0.5" />
      ) : (
        <ChevronDown className="h-3 w-3 ml-0.5" />
      )}
    </button>
  );
};
