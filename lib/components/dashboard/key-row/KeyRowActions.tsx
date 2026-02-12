import React from "react";
import { RefreshCw, Edit2, Trash2, Copy, Check, Power } from "lucide-react";
import { Button } from "../../ui";
import { cn } from "../../../utils/cn";

interface KeyRowActionsProps {
  keyId: string;
  isActive: boolean;
  isRefreshing: boolean;
  onToggleActive: () => void;
  onRefresh: (e: React.MouseEvent) => void;
  onCopyId: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isCopied: boolean;
}

/**
 * KeyRowActions Component
 *
 * Action buttons for key management (activate, refresh, copy, edit, delete).
 */
export const KeyRowActions: React.FC<KeyRowActionsProps> = ({
  isActive,
  isRefreshing,
  onToggleActive,
  onRefresh,
  onCopyId,
  onEdit,
  onDelete,
  isCopied,
}) => {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
      {/* Primary Actions Group */}
      <div className="flex bg-slate-800/80 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-lg overflow-hidden p-0.5">
        {/* Toggle Active Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          className={cn(
            "h-8 w-8 rounded-md transition-all duration-200",
            isActive
              ? "text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
              : "text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10",
          )}
          title={isActive ? "Deactivate" : "Activate"}
        >
          <Power className="h-3.5 w-3.5" />
        </Button>

        {/* Refresh Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
          className={cn(
            "h-8 w-8 rounded-md transition-all duration-200",
            isRefreshing
              ? "animate-spin text-indigo-400"
              : "text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10",
          )}
          title="Validate"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Secondary Actions Group */}
      <div className="flex items-center gap-0.5 bg-slate-800/40 rounded-lg p-0.5 border border-slate-800/50 ml-1">
        {/* Copy ID Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onCopyId}
          className="h-8 w-8 text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
          title="Copy ID"
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Edit Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          className="h-8 w-8 text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
          title="Edit"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </Button>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="h-8 w-8 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
