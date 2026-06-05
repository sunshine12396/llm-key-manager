import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCopy,
  Code2,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Terminal,
  Wand2,
  Zap,
} from "lucide-react";

import {
  useLLMKeyManager,
  useSafetyGuard,
} from "llm-key-manager";
import { analyticsService } from "llm-key-manager/services/analytics.service";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "../ui";
import { ErrorLogs } from "./ErrorLogs";
import { SafetyOverview } from "./SafetyOverview";
import { UsageDashboard } from "./UsageDashboard";
import { cn } from "../../utils/cn";

type PlaygroundTab = "vault" | "testing-ground" | "chat";

type SnippetKey = "setup" | "chat" | "safety" | "analytics";

const integrationSnippets: Record<SnippetKey, string> = {
  setup: `import { LLMKeyManagerProvider } from "llm-key-manager";

export default function App() {
  return (
    <LLMKeyManagerProvider>
      <YourApp />
    </LLMKeyManagerProvider>
  );
}`,
  chat: `import { llmClient } from "llm-key-manager";

const response = await llmClient.chat({
  model: "smart",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.content);`,
  safety: `import { useSafetyGuard } from "llm-key-manager";

function SafetyControls() {
  const { status, setForcedFallback, freezeScanning } = useSafetyGuard();

  return (
    <button onClick={() => setForcedFallback("gpt-4o-mini", "openai")}>
      Force fallback
    </button>
  );
}`,
  analytics: `import { analyticsService } from "llm-key-manager/services/analytics.service";

await analyticsService.recordUsage({
  keyId: "demo-key",
  providerId: "openai",
  modelId: "gpt-4o",
  inputTokens: 100,
  outputTokens: 20,
  success: true,
  latencyMs: 180,
});`,
};

interface DeveloperPlaygroundProps {
  onNavigate?: (tab: PlaygroundTab) => void;
}

export const DeveloperPlayground: React.FC<DeveloperPlaygroundProps> = ({
  onNavigate,
}) => {
  const { keys } = useLLMKeyManager();
  const {
    status,
    lastEvent,
    resetAll,
    setForcedFallback,
    clearForcedFallback,
    freezeScanning,
    resumeScanning,
    enableEmergencyMode,
    disableEmergencyMode,
  } = useSafetyGuard();

  const [activeSnippet, setActiveSnippet] = useState<SnippetKey>("setup");
  const [copied, setCopied] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [activeGuide, setActiveGuide] = useState<"breaker" | "failover" | "overrides">("breaker");

  const providerCircuitSummary = useMemo(() => {
    const values = Object.values(status?.providerCircuits ?? {});
    return {
      open: values.filter((state) => state === "OPEN").length,
      halfOpen: values.filter((state) => state === "HALF_OPEN").length,
      closed: values.filter((state) => state === "CLOSED").length,
    };
  }, [status?.providerCircuits]);

  const keyCircuitSummary = useMemo(() => {
    const values = Object.values(status?.keyCircuits ?? {});
    return {
      open: values.filter((state) => state === "OPEN").length,
      halfOpen: values.filter((state) => state === "HALF_OPEN").length,
      closed: values.filter((state) => state === "CLOSED").length,
    };
  }, [status?.keyCircuits]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(integrationSnippets[activeSnippet]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleReset = () => {
    const confirmed = window.confirm(
      "Reset all safety state, circuits, disabled providers, and forced fallback?",
    );
    if (confirmed) resetAll();
  };

  const handleGenerateSample = async (kind: "usage" | "error") => {
    setIsGeneratingSample(true);
    try {
      if (kind === "usage") {
        await analyticsService.recordUsage({
          keyId: "demo-key",
          providerId: "openai",
          modelId: "gpt-4o",
          inputTokens: 180,
          outputTokens: 48,
          success: true,
          latencyMs: 214,
        });
      } else {
        await analyticsService.recordError({
          keyId: "demo-key",
          providerId: "openai",
          errorType: "server",
          message:
            "Demo failure: Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz123456",
          retryCount: 1,
        });
      }
    } finally {
      setIsGeneratingSample(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/30">
        <div className="border-b border-slate-800 bg-slate-800/50 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg text-slate-100">
                    Testing Ground
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-400">
                    One place to verify vault, discovery, routing, resilience,
                    analytics, and safety behavior in real time.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="indigo" className="gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                {keys.length} keys
              </Badge>
              <Badge variant="emerald" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                {providerCircuitSummary.closed} provider circuits closed
              </Badge>
              <Badge variant="amber" className="gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                {providerCircuitSummary.open + keyCircuitSummary.open} open circuits
              </Badge>
            </div>
          </div>
        </div>

        <CardContent className="p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <QuickStat
              label="Vault"
              value={`${keys.length} keys`}
              icon={<ShieldCheck className="h-4 w-4" />}
              tone="emerald"
              actionLabel="Open vault"
              onAction={() => onNavigate?.("vault")}
            />
            <QuickStat
              label="Safety"
              value={`${status?.disabledProviders.length ?? 0} providers off`}
              icon={<ShieldAlert className="h-4 w-4" />}
              tone="amber"
              actionLabel="Focus safety"
              onAction={() => setActiveSnippet("safety")}
            />
            <QuickStat
              label="Analytics"
              value="Live charts"
              icon={<BarChart3 className="h-4 w-4" />}
              tone="indigo"
              actionLabel="Focus analytics"
              onAction={() => setActiveSnippet("analytics")}
            />
            <QuickStat
              label="Routing"
              value={lastEvent?.type || "Idle"}
              icon={<Sparkles className="h-4 w-4" />}
              tone="neutral"
              actionLabel="Open chat"
              onAction={() => onNavigate?.("chat")}
            />
          </div>
        </CardContent>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <Card className="overflow-hidden border-slate-800 bg-slate-900 shadow-lg shadow-black/20">
            <CardHeader className="border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-slate-200">
                    <Code2 className="h-4 w-4 text-indigo-400" />
                    Integration Snippets
                  </CardTitle>
                  <p className="mt-1 text-xs text-slate-500">
                    Copy the exact setup, chat, safety, and analytics wiring.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="border-slate-700 bg-slate-800 text-slate-200 hover:border-indigo-500/40 hover:text-white"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ClipboardCopy className="h-4 w-4" />
                  )}
                  {copied ? "Copied" : "Copy code"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.keys(integrationSnippets).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveSnippet(key as SnippetKey)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] transition",
                      activeSnippet === key
                        ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                        : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700 hover:text-slate-300",
                    )}
                  >
                    {key}
                  </button>
                ))}
              </div>

              <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0d1117] p-5 text-sm text-slate-300">
                <code>{integrationSnippets[activeSnippet]}</code>
              </pre>
            </CardContent>
          </Card>

          <SafetyOverview />
        </section>

        <section className="space-y-6">
          <Card className="overflow-hidden border-slate-800 bg-slate-900 shadow-lg shadow-black/20">
            <CardHeader className="border-b border-slate-800 bg-slate-800/40">
              <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-slate-200">
                <Zap className="h-4 w-4 text-amber-400" />
                Quick Actions
              </CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Trigger the same state transitions and cleanup flows the app uses.
              </p>
            </CardHeader>

            <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
              <ActionButton
                icon={<Wand2 className="h-4 w-4" />}
                label="Force fallback"
                hint="gpt-4o-mini on OpenAI"
                onClick={() => setForcedFallback("gpt-4o-mini", "openai")}
              />
              <ActionButton
                icon={<RefreshCw className="h-4 w-4" />}
                label="Clear fallback"
                hint="Restore normal routing"
                onClick={clearForcedFallback}
              />
              <ActionButton
                icon={<ShieldAlert className="h-4 w-4" />}
                label="Freeze scanning"
                hint="Pauses background scans"
                onClick={() => freezeScanning("Manual testing freeze")}
              />
              <ActionButton
                icon={<Play className="h-4 w-4" />}
                label="Resume scanning"
                hint="Unfreezes background scans"
                onClick={resumeScanning}
              />
              <ActionButton
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Emergency mode"
                hint="Lock down system-wide controls"
                onClick={() => enableEmergencyMode("Manual UI test")}
              />
              <ActionButton
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Disable emergency"
                hint="Return to normal operation"
                onClick={disableEmergencyMode}
              />
              <ActionButton
                icon={<TestTube2 className="h-4 w-4" />}
                label="Simulate usage"
                hint="Adds one analytics sample"
                onClick={() => void handleGenerateSample("usage")}
                loading={isGeneratingSample}
              />
              <ActionButton
                icon={<Terminal className="h-4 w-4" />}
                label="Simulate error"
                hint="Adds one redacted error sample"
                onClick={() => void handleGenerateSample("error")}
                loading={isGeneratingSample}
              />
              <ActionButton
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Open vault"
                hint="Jump to key management"
                onClick={() => onNavigate?.("vault")}
              />
              <ActionButton
                icon={<Sparkles className="h-4 w-4" />}
                label="Open chat"
                hint="Test routing and failover"
                onClick={() => onNavigate?.("chat")}
              />
              <ActionButton
                icon={<RefreshCw className="h-4 w-4" />}
                label="Reset safety"
                hint="Clears circuits and overrides"
                onClick={handleReset}
                tone="danger"
              />
              <ActionButton
                icon={<BarChart3 className="h-4 w-4" />}
                label="Clear analytics"
                hint="Empties usage and error logs"
                onClick={() => void analyticsService.clearAll()}
                tone="danger"
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <MiniStatusCard
              label="Provider circuits"
              value={`${providerCircuitSummary.open} open`}
              note={`${providerCircuitSummary.halfOpen} half-open, ${providerCircuitSummary.closed} closed`}
            />
            <MiniStatusCard
              label="Key circuits"
              value={`${keyCircuitSummary.open} open`}
              note={`${keyCircuitSummary.halfOpen} half-open, ${keyCircuitSummary.closed} closed`}
            />
          </div>

          <Card className="overflow-hidden border-slate-800 bg-slate-900 shadow-lg shadow-black/20">
            <CardHeader className="border-b border-slate-800 bg-slate-800/40">
              <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-slate-200">
                <FlaskConical className="h-4 w-4 text-indigo-400" />
                Simulation Guides
              </CardTitle>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                Step-by-step guides to test resilience and safety features.
              </p>
            </CardHeader>
            <CardContent className="p-5">
              <div className="mb-4 flex gap-1 border-b border-slate-800 pb-2">
                <button
                  onClick={() => setActiveGuide("breaker")}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-2.5 pb-2 text-xs font-bold transition",
                    activeGuide === "breaker"
                      ? "border-indigo-500 text-indigo-400 font-black"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  )}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Circuit Breaker
                </button>
                <button
                  onClick={() => setActiveGuide("failover")}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-2.5 pb-2 text-xs font-bold transition",
                    activeGuide === "failover"
                      ? "border-indigo-500 text-indigo-400 font-black"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Auto-Failover
                </button>
                <button
                  onClick={() => setActiveGuide("overrides")}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-2.5 pb-2 text-xs font-bold transition",
                    activeGuide === "overrides"
                      ? "border-indigo-500 text-indigo-400 font-black"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  )}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Overrides
                </button>
              </div>

              {activeGuide === "breaker" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">1</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Go to <span className="text-slate-200 cursor-pointer hover:underline font-semibold" onClick={() => onNavigate?.("vault")}>Vault</span>, add a key for <code className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded font-mono text-[10px]">openai</code> with any invalid value (e.g. <code className="text-slate-455 bg-slate-800 px-1 rounded font-mono">sk-invalid-demo</code>).
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">2</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Navigate to <span className="text-slate-200 cursor-pointer hover:underline font-semibold" onClick={() => onNavigate?.("chat")}>Chat</span> and send a message. The request will fail.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">3</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Send another message. After multiple consecutive failures, the engine trips the circuit. In <strong className="text-slate-300">Safety Overview</strong> below, that key/provider circuit status will change to <code className="text-amber-400 font-semibold uppercase">OPEN</code>.
                    </p>
                  </div>
                </div>
              )}

              {activeGuide === "failover" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">1</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Add keys for both <code className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded font-mono text-[10px]">openai</code> and <code className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded font-mono text-[10px]">gemini</code> in the <span className="text-slate-200 cursor-pointer hover:underline font-semibold" onClick={() => onNavigate?.("vault")}>Vault</span>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">2</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Simulate a failure or trip the circuit for your primary provider (e.g. by disabling it or running a failing request).
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">3</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Go to <span className="text-slate-200 cursor-pointer hover:underline font-semibold" onClick={() => onNavigate?.("chat")}>Chat</span> and send a message. The client will automatically failover and route the request to the healthy provider without returning an error to the user!
                    </p>
                  </div>
                </div>
              )}

              {activeGuide === "overrides" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">1</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Click <strong className="text-slate-300">Force Fallback</strong> in Quick Actions to route all chat requests to the fallback model (<code className="text-emerald-400 font-mono text-[10px]">gpt-4o-mini</code>) regardless of normal routing rules.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">2</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Click <strong className="text-slate-300">Emergency Mode</strong> to lock down key retrieval system-wide. Any new request sent in Chat will immediately be blocked for safety.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 mt-0.5">3</span>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Click <strong className="text-slate-300 font-semibold">Reset Safety</strong> to clear all active override state and return the system to normal operations.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="space-y-6">
        <UsageDashboard />
        <ErrorLogs />
      </div>
    </div>
  );
};

function QuickStat({
  label,
  value,
  icon,
  tone,
  actionLabel,
  onAction,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "indigo" | "neutral";
  actionLabel: string;
  onAction: () => void;
}) {
  const tones = {
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    indigo: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    neutral: "border-slate-800 bg-slate-950/50 text-slate-300",
  };

  return (
    <Card className="border-slate-800 bg-slate-950/40">
      <CardContent className="p-4">
        <div className={cn("inline-flex rounded-xl border p-2", tones[tone])}>
          {icon}
        </div>
        <p className="mt-4 text-xl font-bold tracking-tight text-slate-100">
          {value}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          className="mt-4 w-full border-slate-800 bg-slate-900 text-slate-200 hover:border-indigo-500/30 hover:text-white"
        >
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  onClick,
  loading = false,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  loading?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "rounded-2xl border p-4 text-left transition hover:-translate-y-px hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-60",
        tone === "danger"
          ? "border-red-500/20 bg-red-500/10 hover:bg-red-500/15"
          : "border-slate-800 bg-slate-950/40 hover:bg-slate-900",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-200">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
      </div>
    </button>
  );
}

function MiniStatusCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900 shadow-lg shadow-black/20">
      <CardContent className="p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </p>
        <p className="mt-2 text-lg font-semibold text-slate-100">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{note}</p>
      </CardContent>
    </Card>
  );
}
