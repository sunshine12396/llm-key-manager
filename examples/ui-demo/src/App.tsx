import { useState } from "react";
import {
  Activity,
  BarChart3,
  Key,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { llmClient, useLLMKeyManager, useSafetyGuard } from "llm-key-manager";

import {
  DeveloperPlayground,
  KeyListDashboard,
  ValidationNotificationToast,
} from "./components";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type TabId = "testing-ground" | "vault" | "chat";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

export default function App() {
  const { keys } = useLLMKeyManager();
  const { status, lastEvent } = useSafetyGuard();
  const [activeTab, setActiveTab] = useState<TabId>("testing-ground");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const disabledProviders = status?.disabledProviders.length ?? 0;
  const disabledKeys = status?.disabledKeys.length ?? 0;
  const fallback = status?.forcedFallback ?? null;

  const handleSendChat = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setIsSending(true);

    try {
      const response = await llmClient.chat({
        model: "smart",
        messages: [...messages, userMsg].map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.content },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error?.message || "Unable to complete request"}`,
          isError: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-6 md:py-8">
        <header className="flex flex-col gap-5 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 shadow-lg shadow-black/20">
                <ShieldCheck className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-50 md:text-4xl">
                  LLM Key Manager
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">
                  A local-first control surface for vault, routing, resilience,
                  analytics, and safety.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <BadgeChip icon={<Key className="h-3.5 w-3.5" />} label={`${keys.length} keys`} />
              <BadgeChip
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                label={`${disabledProviders} providers off`}
                tone={disabledProviders > 0 ? "warning" : "safe"}
              />
              <BadgeChip
                icon={<Activity className="h-3.5 w-3.5" />}
                label={`${disabledKeys} keys off`}
                tone={disabledKeys > 0 ? "warning" : "safe"}
              />
              <BadgeChip
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label={
                  fallback
                    ? `${fallback.model}${fallback.provider ? ` · ${fallback.provider}` : ""}`
                    : "no fallback override"
                }
                tone={fallback ? "info" : "neutral"}
              />
              <BadgeChip
                icon={<RefreshCw className={cn("h-3.5 w-3.5", lastEvent && "animate-pulse")} />}
                label={lastEvent ? lastEvent.type : "idle"}
                tone={lastEvent ? "info" : "neutral"}
              />
            </div>
          </div>

          <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-1 shadow-lg shadow-black/20">
            <TabButton
              active={activeTab === "testing-ground"}
              icon={<BarChart3 className="h-4 w-4" />}
              label="Testing Ground"
              onClick={() => setActiveTab("testing-ground")}
            />
            <TabButton
              active={activeTab === "vault"}
              icon={<Key className="h-4 w-4" />}
              label="Vault"
              onClick={() => setActiveTab("vault")}
            />
            <TabButton
              active={activeTab === "chat"}
              icon={<Terminal className="h-4 w-4" />}
              label="Chat"
              onClick={() => setActiveTab("chat")}
            />
          </nav>
        </header>

        <main className="flex-1 pb-8">
          {activeTab === "testing-ground" && (
            <DeveloperPlayground
              onNavigate={(tab) => {
                if (tab === "vault") setActiveTab("vault");
                if (tab === "chat") setActiveTab("chat");
                if (tab === "testing-ground") setActiveTab("testing-ground");
              }}
            />
          )}

          {activeTab === "vault" && <KeyListDashboard />}

          {activeTab === "chat" && (
            <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/30">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/50 px-4 py-3 md:px-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-3 w-3 rounded-full bg-red-500/40" />
                  <div className="flex h-3 w-3 rounded-full bg-yellow-500/40" />
                  <div className="flex h-3 w-3 rounded-full bg-green-500/40" />
                  <span className="ml-3 text-xs font-mono text-slate-500">
                    unified-llm-session
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400">
                  <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
                  Auto failover enabled
                </div>
              </div>

              <div className="space-y-6 p-5 md:p-8">
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-950/30 px-6 py-14 text-center">
                  <Terminal className="mb-4 h-12 w-12 text-indigo-400" />
                  <h2 className="text-2xl font-semibold text-slate-100">
                    Model Demo
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                    Send a prompt and the client will route through the current
                    safety, quota, and fallback rules before choosing a key.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-950/40 p-4 md:flex-row md:items-center">
                    <input
                      type="text"
                      placeholder="Ask anything... (using the smart failover alias)"
                      className="h-12 flex-1 rounded-2xl border border-slate-800 bg-slate-900 px-5 text-sm text-slate-100 outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/10"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                      disabled={isSending}
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={isSending || !prompt.trim()}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-3 px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      AES-256-GCM vault
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      Multi-provider routing
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-amber-400" />
                      Quota-aware failover
                    </span>
                  </div>

                  <div className="max-h-[380px] space-y-4 overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950/40 p-4">
                    {messages.length === 0 ? (
                      <div className="flex min-h-[240px] flex-col items-center justify-center text-center text-slate-500">
                        <Terminal className="mb-4 h-10 w-10 text-slate-600" />
                        <p className="text-sm font-medium text-slate-400">
                          No messages yet.
                        </p>
                        <p className="mt-1 max-w-sm text-xs leading-5">
                          Start a request to see the routing, fallback, and
                          error handling flow in action.
                        </p>
                      </div>
                    ) : (
                      messages.map((message, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex max-w-[82%] flex-col gap-1",
                            message.role === "user"
                              ? "ml-auto items-end"
                              : "mr-auto items-start",
                          )}
                        >
                          <div
                            className={cn(
                              "rounded-3xl px-4 py-3 text-sm leading-relaxed",
                              message.role === "user"
                                ? "rounded-br-md bg-indigo-500 text-white"
                                : message.isError
                                  ? "rounded-bl-md border border-red-500/20 bg-red-500/10 text-red-300"
                                  : "rounded-bl-md border border-slate-800 bg-slate-900 text-slate-200",
                            )}
                          >
                            {message.content}
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                            {message.role}
                          </span>
                        </div>
                      ))
                    )}

                    {isSending && (
                      <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
                        <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                        Resolving best key and model...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      <ValidationNotificationToast />
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex min-w-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function BadgeChip({
  icon,
  label,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "neutral" | "safe" | "warning" | "info";
}) {
  const tones = {
    neutral: "border-slate-800 bg-slate-900 text-slate-400",
    safe: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    info: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em]",
        tones[tone],
      )}
    >
      {icon}
      {label}
    </span>
  );
}
