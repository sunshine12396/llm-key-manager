import { useState } from 'react';
import {
  Key,
  Zap,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Terminal,
  Send
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Library Imports (via alias)
import { llmClient, useLLMKeyManager } from 'llm-key-manager';

import { useConfirm } from './components/ui';
import { KeyListDashboard } from './components/dashboard/KeyListDashboard';

/** Tailwind Utility */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const { } = useLLMKeyManager();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'vault' | 'chat'>('vault');
  const { ConfirmDialog } = useConfirm();

  // Most state is now managed by KeyListDashboard when in vault tab
  // Chat Handlers

  const handleSendChat = async () => {
    if (!prompt.trim()) return;

    const userMsg = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setIsSending(true);

    try {
      const response = await llmClient.chat({
        model: "smart", // Use alias
        messages: [...messages, userMsg]
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, isError: true }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-outfit font-bold gradient-text mb-2 flex items-center gap-3">
            <ShieldCheck className="text-accent-blue" size={40} />
            LLM Key Manager
          </h1>
          <p className="text-gray-400 max-w-lg">
            Production-grade multi-provider LLM failover, security, and usage management demo.
          </p>
        </div>

        <nav className="flex bg-card p-1 rounded-xl border border-white/5 self-start">
          <button
            onClick={() => setActiveTab('vault')}
            className={cn(
              "px-6 py-2 rounded-lg transition-all flex items-center gap-2 font-medium",
              activeTab === 'vault' ? "bg-accent-blue text-white shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            <Key size={18} /> Vault
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              "px-6 py-2 rounded-lg transition-all flex items-center gap-2 font-medium",
              activeTab === 'chat' ? "bg-accent-blue text-white shadow-lg" : "text-gray-400 hover:text-white"
            )}
          >
            <Terminal size={18} /> Demo
          </button>
        </nav>
      </header>

      {activeTab === 'vault' ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <KeyListDashboard />
        </div>
      ) : (
        <div className="h-[600px] glass rounded-3xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
          <div className="bg-white/5 p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500/40" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
              <div className="w-3 h-3 rounded-full bg-green-500/40" />
              <span className="text-xs font-mono text-gray-500 ml-4">unified-llm-session v1.0</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-black/40 px-3 py-1.5 rounded-full">
              <Cpu size={14} className="text-accent-blue" />
              Auto-Failover Mode Active
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                <Terminal size={48} className="mb-4 text-accent-blue" />
                <h3 className="text-xl font-outfit font-medium">Model Demo</h3>
                <p className="max-w-xs text-sm">Send a prompt and the manager will select the best available key from your vault.</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={cn(
                "flex flex-col max-w-[80%]",
                msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
              )}>
                <div className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed",
                  msg.role === 'user'
                    ? "bg-accent-blue text-white rounded-tr-none"
                    : msg.isError
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : "bg-white/5 text-gray-200 border border-white/5 rounded-tl-none"
                )}>
                  {msg.content}
                </div>
                <span className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest">
                  {msg.role}
                </span>
              </div>
            ))}
            {isSending && (
              <div className="flex items-center gap-2 text-gray-400 text-xs animate-pulse">
                <RefreshCw size={14} className="animate-spin" /> Resolving best model and key...
              </div>
            )}
          </div>

          <div className="p-6 bg-white/5 border-t border-white/5">
            <div className="relative">
              <input
                type="text"
                placeholder="Ask anything... (using smart failover alias)"
                className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 pr-16 outline-none focus:border-accent-blue transition-all"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                disabled={isSending}
              />
              <button
                onClick={handleSendChat}
                disabled={isSending || !prompt.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-accent-blue text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} />
              </button>
            </div>
            <div className="flex gap-4 mt-4 px-2">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-bold">
                <ShieldCheck size={12} className="text-green-500" /> AES-256-GCM Vault
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-bold">
                <Zap size={12} className="text-yellow-500" /> Multi-Provider
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Old Code Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
}
