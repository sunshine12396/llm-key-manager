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
    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {/* Primary Actions Group */}
      <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {/* Toggle Active Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          className={cn(
            "h-8 w-8 rounded-none border-r border-slate-100",
            isActive
              ? "text-slate-400 hover:text-red-500 hover:bg-red-50"
              : "text-slate-300 hover:text-indigo-500 hover:bg-indigo-50",
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
            "h-8 w-8 rounded-none",
            isRefreshing
              ? "animate-spin"
              : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50",
          )}
          title="Validate"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Secondary Actions Group */}
      <div className="flex gap-1 ml-2">
        {/* Copy ID Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onCopyId}
          className="h-8 w-8 text-slate-400"
          title="Copy ID"
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Edit Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          className="h-8 w-8 text-slate-400"
          title="Edit"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </Button>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
