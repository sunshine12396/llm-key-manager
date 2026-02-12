import React from "react";
import { Key, Star, AlertCircle } from "lucide-react";
import { Badge } from "../../ui";
import { cn } from "../../../utils/cn";
import {
  getPriorityBadgeVariant,
  getProviderBadgeVariant,
} from "./key-row.utils";
import type { KeyMetadata } from "../../../models/types";

interface KeyRowHeaderProps {
  keyData: KeyMetadata;
  isActive: boolean;
  isPrimary: boolean;
}

/**
 * KeyRowHeader Component
 *
 * Displays provider badge, tier, priority, and key label.
 */
export const KeyRowHeader: React.FC<KeyRowHeaderProps> = ({
  keyData,
  isActive,
  isPrimary,
}) => {
  return (
    <div className="w-60 min-w-0 flex-shrink-0">
      {/* Badges Row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge
          variant={getProviderBadgeVariant(keyData.providerId)}
          size="sm"
          className="font-black uppercase tracking-tighter text-[9px] px-2 py-0"
        >
          {keyData.providerId}
        </Badge>

        {isPrimary && (
          <Badge
            variant="amber"
            size="sm"
            className="bg-amber-500/10 text-amber-500 border-amber-500/30 font-black text-[9px] tracking-widest shadow-[0_0_10px_rgba(245,158,11,0.2)]"
          >
            <Star className="h-2.5 w-2.5 mr-1 fill-amber-500" />
            PRIMARY
          </Badge>
        )}

        {keyData.tier && (
          <Badge
            variant="slate"
            size="sm"
            className="bg-slate-800/80 text-slate-400 border-slate-700/50 font-black text-[9px] tracking-widest"
          >
            {keyData.tier.toUpperCase()}
          </Badge>
        )}

        <Badge
          variant={getPriorityBadgeVariant(keyData.priority)}
          size="sm"
          className="font-black uppercase tracking-widest text-[9px] px-2 py-0 border-opacity-50"
        >
          {keyData.priority || "medium"}
        </Badge>

        {keyData.isRevoked && (
          <span title="Revoked" className="text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {/* Key Label */}
      <div className="flex items-center gap-2.5 group-hover:translate-x-1 transition-transform duration-300 ease-out">
        <Key
          className={cn(
            "h-4 w-4",
            isActive ? "text-indigo-400" : "text-slate-600",
          )}
        />
        <p
          className={cn(
            "font-black text-sm truncate max-w-[180px] tracking-tight leading-none",
            isActive ? "text-slate-200" : "text-slate-500 line-through opacity-50",
          )}
        >
          {keyData.label}
        </p>
      </div>
    </div>
  );
};
