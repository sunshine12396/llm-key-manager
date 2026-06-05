import React from "react";
import {
  Flame,
  PauseCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Zap,
} from "lucide-react";

import { useSafetyGuard } from "llm-key-manager";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "../ui";
import { cn } from "../../utils/cn";

function circuitCounts(circuits: Record<string, string>) {
  const values = Object.values(circuits);
  return {
    closed: values.filter((state) => state === "CLOSED").length,
    open: values.filter((state) => state === "OPEN").length,
    halfOpen: values.filter((state) => state === "HALF_OPEN").length,
  };
}

export const SafetyOverview: React.FC = () => {
  const { status, lastEvent, resetAll, clearForcedFallback, resumeScanning, disableEmergencyMode } =
    useSafetyGuard();

  const providerCounts = circuitCounts(status?.providerCircuits ?? {});
  const keyCounts = circuitCounts(status?.keyCircuits ?? {});
  const fallback = status?.forcedFallback ?? null;

  const handleReset = () => {
    const confirmed = window.confirm(
      "This will reset all provider and key safety state. Continue?",
    );
    if (confirmed) {
      resetAll();
    }
  };

  return (
    <Card className="overflow-hidden border-slate-700 bg-slate-900 shadow-lg shadow-black/20">
      <CardHeader className="border-b border-slate-800/80 bg-slate-800/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-slate-200">
              <ShieldAlert className="h-4 w-4 text-indigo-400" />
              Safety Overview
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Live provider blocking, circuit state, emergency mode, and fallback controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {status?.emergencyMode && (
              <Badge variant="red" className="gap-1.5 border-red-500/20 bg-red-500/10 text-red-400">
                <Flame className="h-3 w-3" />
                Emergency
              </Badge>
            )}
            {status?.scanningFrozen && (
              <Badge variant="amber" className="gap-1.5 border-amber-500/20 bg-amber-500/10 text-amber-400">
                <PauseCircle className="h-3 w-3" />
                Scan Frozen
              </Badge>
            )}
            {!status?.emergencyMode && !status?.scanningFrozen && (
              <Badge variant="emerald" className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="h-3 w-3" />
                Normal
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Disabled Providers"
            value={status?.disabledProviders.length ?? 0}
            icon={<ShieldOff className="h-4 w-4" />}
            tone="red"
          />
          <StatTile
            label="Disabled Keys"
            value={status?.disabledKeys.length ?? 0}
            icon={<ShieldAlert className="h-4 w-4" />}
            tone="amber"
          />
          <StatTile
            label="Provider Circuits"
            value={`${providerCounts.open} open / ${providerCounts.halfOpen} half-open`}
            icon={<Zap className="h-4 w-4" />}
            tone="indigo"
          />
          <StatTile
            label="Key Circuits"
            value={`${keyCounts.open} open / ${keyCounts.halfOpen} half-open`}
            icon={<Sparkles className="h-4 w-4" />}
            tone="emerald"
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Current Override
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-200">
                  {fallback
                    ? `${fallback.model}${fallback.provider ? ` · ${fallback.provider}` : ""}`
                    : "No forced fallback active"}
                </p>
              </div>

              {fallback ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearForcedFallback}
                  className="border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500/40 hover:text-white"
                >
                  Clear Fallback
                </Button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Provider States
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="emerald">Closed {providerCounts.closed}</Badge>
                  <Badge variant="amber">Half-open {providerCounts.halfOpen}</Badge>
                  <Badge variant="red">Open {providerCounts.open}</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Key States
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="emerald">Closed {keyCounts.closed}</Badge>
                  <Badge variant="amber">Half-open {keyCounts.halfOpen}</Badge>
                  <Badge variant="red">Open {keyCounts.open}</Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Last Event
            </p>
            {lastEvent ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm font-semibold text-slate-200">
                  {lastEvent.type}
                </p>
                <p className="text-xs text-slate-400">
                  {lastEvent.reason || lastEvent.label || lastEvent.providerId || lastEvent.keyId || "State updated"}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No safety events yet.</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {status?.scanningFrozen ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resumeScanning}
                  className="border-amber-500/20 bg-amber-500/10 text-amber-300 hover:border-amber-500/40"
                >
                  Resume Scan
                </Button>
              ) : null}
              {status?.emergencyMode ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disableEmergencyMode}
                  className="border-red-500/20 bg-red-500/10 text-red-300 hover:border-red-500/40"
                >
                  Disable Emergency
                </Button>
              ) : null}
              <Button
                variant="danger"
                size="sm"
                onClick={handleReset}
                className="border-red-500/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset All
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "red" | "amber" | "indigo" | "emerald";
}) {
  const tones = {
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    indigo: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className={cn("inline-flex rounded-xl border p-2", tones[tone])}>
        {icon}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-100">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
    </div>
  );
}
