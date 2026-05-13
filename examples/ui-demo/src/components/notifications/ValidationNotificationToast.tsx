import React, { useEffect, useState } from "react";
import { useLLMKeyManager } from "llm-key-manager";

import { ValidationEvent } from "llm-key-manager/services/validation/validation.types";


import { CheckCircle, XCircle, Loader2, X, Zap } from "lucide-react";

import { cn } from "../../utils/cn";
import { Badge } from "../ui";

type ToastItem = ValidationEvent & {
  id: string;
  createdAt: number;
  autoDismiss: boolean;
};

export const ValidationNotificationToast: React.FC = () => {
  const { validationEvents, dismissValidationEvent } = useLLMKeyManager();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    // Convert validation events to toasts
    validationEvents.forEach((event) => {
      setToasts((prev) => {
        // Check if we already have a toast for this key
        const existing = prev.find((t) => t.keyId === event.keyId);

        if (existing) {
          // Update existing toast
          return prev.map((t) =>
            t.keyId === event.keyId
              ? {
                ...t,
                ...event,
                autoDismiss:
                  event.type === "validation:complete" ||
                  event.type === "validation:error",
              }
              : t,
          );
        } else {
          // Add new toast
          return [
            ...prev,
            {
              ...event,
              id: `toast-${event.keyId}-${Date.now()}`,
              createdAt: Date.now(),
              autoDismiss: false,
            } as ToastItem,
          ];
        }
      });
    });
  }, [validationEvents]);

  // Auto-dismiss completed/failed toasts after delay
  useEffect(() => {
    const timers = toasts
      .filter(
        (t) =>
          t.autoDismiss &&
          (t.type === "validation:complete" || t.type === "validation:error"),
      )
      .map((toast) => {
        return setTimeout(
          () => {
            handleDismiss(toast.keyId);
          },
          toast.type === "validation:complete" ? 5000 : 8000,
        ); // Success: 5s, Failure: 8s
      });

    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  const handleDismiss = (keyId: string) => {
    setToasts((prev) => prev.filter((t) => t.keyId !== keyId));
    dismissValidationEvent(keyId);
  };

  const getToastConfig = (toast: ToastItem) => {
    switch (toast.type) {
      case "validation:start":
      case "validation:model":
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          title: "Validating API Key...",
          subtitle:
            toast.type === "validation:model"
              ? `Verified ${toast.model}`
              : `Discovering models for ${toast.label}`,
          color: "bg-slate-900 border-indigo-500/20",
          iconBg: "bg-indigo-500/10 text-indigo-400",
          progress: toast.type === "validation:model" ? 50 : 10,
        };
      case "validation:complete":
        const modelCount = (toast as any).modelsFound || 0;
        return {
          icon: <CheckCircle className="h-5 w-5" />,
          title: "Key Validated Successfully",
          subtitle: `${modelCount} model${modelCount !== 1 ? "s" : ""} available for ${toast.label}`,
          color: "bg-slate-900 border-emerald-500/20",
          iconBg: "bg-emerald-500/10 text-emerald-400",
          progress: 100,
        };
      case "validation:error":
        const error = (toast as any).error as Error;
        return {
          icon: <XCircle className="h-5 w-5" />,
          title: "Validation Failed",
          subtitle: error?.message || `Unable to validate ${toast.label}`,
          color: "bg-slate-900 border-red-500/20",
          iconBg: "bg-red-500/10 text-red-400",
          progress: 100,
        };
      default:
        return {
          icon: <Zap className="h-5 w-5" />,
          title: "Processing...",
          subtitle: (toast as any).label || "Unknown Key",
          color: "bg-slate-900 border-slate-700",
          iconBg: "bg-slate-800 text-slate-400",
          progress: 0,
        };
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full">
      {toasts.map((toast) => {
        const config = getToastConfig(toast);

        return (
          <div
            key={toast.keyId} // Changed from ID to KeyID for stable key if needed, or stick to ID
            className={cn(
              "relative rounded-2xl shadow-2xl shadow-black/50 border overflow-hidden animate-in slide-in-from-right-5 fade-in duration-300",
              config.color,
            )}
          >
            {/* Progress bar */}
            {(toast.type === "validation:start" ||
              toast.type === "validation:model") && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                    style={{ width: `${config.progress}%` }}
                  />
                </div>
              )}

            <div className="p-4 flex items-start gap-4">
              {/* Icon */}
              <div
                className={cn("p-2.5 rounded-xl flex-shrink-0", config.iconBg)}
              >
                {config.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-200">
                    {config.title}
                  </p>
                  <Badge variant="slate" size="sm" className="text-[8px] bg-slate-800 text-slate-400 border-slate-700">
                    {toast.provider.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {config.subtitle}
                </p>

                {/* Success summary */}
                {toast.type === "validation:complete" && (
                  <div className="mt-2 text-[10px] text-emerald-400 font-medium">
                    Verified and indexed {toast.modelsFound} models
                  </div>
                )}

                {/* Error guidance for failures */}
                {toast.type === "validation:error" && (
                  <p className="text-[10px] text-red-400 mt-2 font-medium">
                    Please check your credentials and try again.
                  </p>
                )}
              </div>

              {/* Dismiss button */}
              <button
                onClick={() => handleDismiss(toast.keyId)}
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
