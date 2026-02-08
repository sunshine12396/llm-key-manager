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
    <div className="w-56 min-w-0 flex-shrink-0">
      {/* Badges Row */}
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Badge variant={getProviderBadgeVariant(keyData.providerId)} size="sm">
          {keyData.providerId}
        </Badge>

        {isPrimary && (
          <Badge
            variant="amber"
            size="sm"
            className="bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
          >
            <Star className="h-2.5 w-2.5 mr-1 fill-amber-400" />
            PRIMARY
          </Badge>
        )}

        {keyData.tier && (
          <Badge
            variant="slate"
            size="sm"
            className="bg-slate-100 text-slate-600 border-slate-200"
          >
            {keyData.tier.toUpperCase()}
          </Badge>
        )}

        <Badge variant={getPriorityBadgeVariant(keyData.priority)} size="sm">
          {keyData.priority || "medium"}
        </Badge>

        {keyData.isRevoked && (
          <span title="Revoked" className="text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {/* Key Label */}
      <div className="flex items-center gap-2 group-hover:translate-x-0.5 transition-transform duration-300">
        <Key
          className={cn(
            "h-3.5 w-3.5",
            isActive ? "text-indigo-400" : "text-slate-300",
          )}
        />
        <p
          className={cn(
            "font-bold text-sm truncate max-w-[160px] tracking-tight",
            isActive ? "text-slate-700" : "text-slate-400 line-through",
          )}
        >
          {keyData.label}
        </p>
      </div>
    </div>
  );
};
