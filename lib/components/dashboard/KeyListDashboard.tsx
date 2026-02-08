import React, { useState } from "react";
import { KeyMetadata } from "../../models/types";
import useLLMKeyManager from "../../hooks/useLLMKeyManager";
import { EditKeyModal } from "../forms/EditKeyModal";
import { AddKeyForm as AddKeyModal } from "../forms/AddKeyForm";
import {
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  Plus,
  Search,
} from "lucide-react";
import { Card, Button, Badge, Input, useConfirm } from "../ui";
import { KeyRow } from "./key-row";
import { EmptyState } from "./EmptyState";
import { cn } from "../../utils/cn";

export const KeyListDashboard: React.FC = () => {
  const { keys, deleteKey, refreshKeys, updateKey, validateKey } =
    useLLMKeyManager();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<KeyMetadata | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGloballyRefreshing, setIsGloballyRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();

  const toggleSelect = (id: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedKeys.size === keys.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(keys.map((k) => k.id)));
  };

  const handleDelete = async (id: string) => {
    const key = keys.find((k) => k.id === id);
    const confirmed = await confirm({
      title: "Delete API Key?",
      message: `This will permanently delete "${key?.label || "this key"}". This action cannot be undone.`,
      confirmText: "Delete Key",
      cancelText: "Keep It",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsDeleting(id);
    try {
      await deleteKey(id);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error("Failed to delete key:", error);
      alert("Failed to delete key. Please try again.");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm({
      title: `Delete ${selectedKeys.size} Keys?`,
      message: `You're about to permanently delete ${selectedKeys.size} API keys. This action cannot be undone.`,
      confirmText: `Delete ${selectedKeys.size} Keys`,
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      for (const id of selectedKeys) await deleteKey(id);
      setSelectedKeys(new Set());
    } catch (error) {
      console.error("Failed to delete keys:", error);
      alert("Failed to delete some keys. Please try again.");
    }
  };

  const handleGlobalRefresh = async () => {
    setIsGloballyRefreshing(true);
    try {
      const currentKeys = await refreshKeys();
      for (const key of currentKeys) {
        await validateKey(key.id);
      }
    } finally {
      setIsGloballyRefreshing(false);
    }
  };

  const handleKeyRefresh = async (id: string) => {
    await validateKey(id);
  };

  const handleEdit = (id: string) => {
    const key = keys.find((k) => k.id === id);
    if (key) setEditingKey(key);
  };

  const handleSaveEdit = async (
    id: string,
    newLabel: string,
    priority: "high" | "medium" | "low",
  ) => {
    await updateKey(id, { label: newLabel, priority });
  };

  const handleToggleActive = async (
    id: string,
    isEnabled: boolean | undefined,
  ) => {
    const newState = !(isEnabled !== false);
    await updateKey(id, { isEnabled: newState });
  };

  const filteredKeys = keys.filter(
    (k) =>
      k.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.providerId.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (keys.length === 0) {
    return (
      <>
        <EmptyState onAddKey={() => setIsAddModalOpen(true)} />
        <AddKeyModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Toolbar */}
      <Card
        className={cn(
          "border-slate-200/80 shadow-lg shadow-slate-200/50",
          "sticky top-0 z-30",
          "bg-white/95 backdrop-blur-xl",
          "rounded-2xl overflow-hidden",
        )}
      >
        {/* Gradient accent line */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4">
          {/* Left side: Select All + Search */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Select All Button */}
            <button
              onClick={selectAll}
              className={cn(
                "flex items-center justify-center",
                "h-11 w-11 rounded-xl",
                "border-2 transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                selectedKeys.size === keys.length
                  ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                  : "bg-slate-50 border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500",
              )}
              aria-label={
                selectedKeys.size === keys.length
                  ? "Deselect all"
                  : "Select all"
              }
            >
              {selectedKeys.size === keys.length ? (
                <CheckSquare className="h-5 w-5" />
              ) : (
                <Square className="h-5 w-5" />
              )}
            </button>

            {/* Search Input */}
            <div className="relative flex-1 md:w-72">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <Input
                placeholder="Search keys or providers..."
                className={cn(
                  "pl-10 h-11",
                  "bg-slate-50/80 border-slate-200/80",
                  "rounded-xl",
                  "placeholder:text-slate-400",
                  "focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10",
                  "transition-all duration-200",
                )}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span className="sr-only">Clear search</span>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Right side: Actions */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {selectedKeys.size > 0 ? (
              /* Bulk Action Mode */
              <div className="flex items-center gap-3 animate-in slide-in-from-right-4 fade-in duration-300">
                <Badge
                  variant="slate"
                  className={cn(
                    "h-11 px-5 text-sm font-semibold",
                    "bg-slate-100 border-slate-200",
                    "flex items-center gap-2",
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                  {selectedKeys.size} selected
                </Badge>
                <Button
                  variant="danger"
                  onClick={handleBulkDelete}
                  className={cn(
                    "h-11 px-5",
                    "bg-gradient-to-r from-red-500 to-rose-500",
                    "hover:from-red-600 hover:to-rose-600",
                    "shadow-lg shadow-red-500/25",
                    "border-0",
                    "font-semibold",
                  )}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected
                </Button>
              </div>
            ) : (
              /* Normal Mode */
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleGlobalRefresh}
                  isLoading={isGloballyRefreshing}
                  className={cn(
                    "h-11 w-11 rounded-xl",
                    "border-slate-200 bg-white",
                    "hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600",
                    "transition-all duration-200",
                    isGloballyRefreshing && "animate-spin",
                  )}
                  title="Verify All Keys"
                >
                  {!isGloballyRefreshing && <RefreshCw className="h-4 w-4" />}
                </Button>
                <Button
                  onClick={() => setIsAddModalOpen(true)}
                  className={cn(
                    "h-11 px-6",
                    "bg-gradient-to-r from-indigo-500 to-purple-500",
                    "hover:from-indigo-600 hover:to-purple-600",
                    "shadow-lg shadow-indigo-500/25",
                    "border-0",
                    "font-semibold",
                    "rounded-xl",
                    "transition-all duration-200",
                    "active:scale-[0.98]",
                  )}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Key
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Content List */}
      <Card
        className={cn(
          "overflow-hidden",
          "border-slate-200/80",
          "shadow-xl shadow-slate-200/40",
          "rounded-2xl",
        )}
      >
        {/* Table Header */}
        <div
          className={cn(
            "hidden md:flex items-center gap-4",
            "bg-gradient-to-r from-slate-50 to-slate-100/50",
            "border-b border-slate-100",
            "px-5 py-4",
          )}
        >
          <div className="w-10" /> {/* Checkbox spacer */}
          <div className="w-56">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
              Provider & Label
            </span>
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
              Status & Capabilities
            </span>
          </div>
          <div className="w-24 text-right">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">
              Created
            </span>
          </div>
          <div className="w-28">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] text-center block">
              Actions
            </span>
          </div>
        </div>

        {/* Key Rows */}
        <div className="divide-y divide-slate-100/80">
          {filteredKeys.length > 0 ? (
            filteredKeys.map((key, index) => (
              <div
                key={key.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <KeyRow
                  keyData={key}
                  selected={selectedKeys.has(key.id)}
                  isDeleting={isDeleting === key.id}
                  onSelect={() => toggleSelect(key.id)}
                  onDelete={() => handleDelete(key.id)}
                  onRefresh={() => handleKeyRefresh(key.id)}
                  onEdit={() => handleEdit(key.id)}
                  onToggleActive={() =>
                    handleToggleActive(key.id, key.isEnabled)
                  }
                />
              </div>
            ))
          ) : (
            /* No Results State */
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-slate-300" />
              </div>
              <p className="text-lg font-semibold text-slate-600 mb-1">
                No keys found
              </p>
              <p className="text-sm text-slate-400 text-center max-w-sm">
                No keys match "{searchQuery}". Try a different search term or{" "}
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-indigo-500 hover:text-indigo-600 font-medium underline underline-offset-2"
                >
                  clear the filter
                </button>
                .
              </p>
            </div>
          )}
        </div>

        {/* Footer with count */}
        {filteredKeys.length > 0 && (
          <div className="bg-slate-50/50 border-t border-slate-100 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Showing{" "}
              <span className="font-semibold text-slate-600">
                {filteredKeys.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-600">
                {keys.length}
              </span>{" "}
              keys
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Modals */}
      <EditKeyModal
        isOpen={!!editingKey}
        onClose={() => setEditingKey(null)}
        onSave={handleSaveEdit}
        keyData={editingKey}
      />

      <AddKeyModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
};
