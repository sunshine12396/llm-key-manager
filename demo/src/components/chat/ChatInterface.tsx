import React, { useState } from 'react';
import { useLLMKeyManager, llmClient } from '../../../../lib';
import { AIProviderId } from '../../../../lib/models/types';
import { MessageSquare, Terminal, Send, Activity, Sparkles, Zap, Brain, Code } from 'lucide-react';

// Simplified Model Options focused on Capabilities (which trigger auto-switching)
const MODEL_OPTIONS = [
    { id: 'any', label: 'Any Available', icon: Sparkles, desc: 'Try any model from any provider you have keys for' },
    { id: 'smart', label: 'Auto (High Intelligence)', icon: Sparkles, desc: 'Prioritizes o1, gpt-4o, Claude 3.5, etc. with auto-failover' },
    { id: 'fast', label: 'Auto (High Speed)', icon: Zap, desc: 'Prioritizes 4o-mini, Flash, Haiku' },
    { id: 'coding', label: 'Auto (Technical/Code)', icon: Code, desc: 'Optimized for logic and engineering' },
    { id: 'reasoning', label: 'Auto (Deep Reasoning)', icon: Brain, desc: 'Prioritizes o1, o3-mini, Claude opus' },
];

const RAW_MODELS = [
    { id: 'o1', label: 'Raw: OpenAI o1' },
    { id: 'o3-mini', label: 'Raw: OpenAI o3-mini' },
    { id: 'gpt-4o', label: 'Raw: GPT-4o' },
    { id: 'claude-3-5-sonnet-latest', label: 'Raw: Claude 3.5' },
];

export const ChatInterface: React.FC = () => {
    const { keys, isUnlocked } = useLLMKeyManager();
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'error', content: string, meta?: any }>>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>('any');
    const [explicitProvider, setExplicitProvider] = useState<AIProviderId | ''>('');

    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const activeKeys = keys.filter(k => !k.isRevoked && k.isEnabled !== false);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        const startTime = Date.now();

        try {
            // Use the Unified Client!
            // No need to manually construct fetch requests anymore.
            const response = await llmClient.chat({
                model: selectedModel,
                messages: [{ role: 'user', content: userMsg }]
            }, {
                // Only pass providerId if user explicitly forces it, otherwise let auto-detection work
                providerId: explicitProvider || undefined
            });

            const duration = Date.now() - startTime;

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.content,
                meta: {
                    latency: duration,
                    model: response.model,
                    providerId: response.providerId,
                    attempts: response.attempts
                }
            }]);

        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'error',
                content: error instanceof Error ? error.message : String(error),
                meta: {
                    latency: Date.now() - startTime
                }
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isUnlocked) return <div className="p-12 text-center text-slate-500 font-medium">Please unlock the vault first to use the chat.</div>;

    return (
        <div className="flex flex-col h-[650px] border-0 rounded-2xl overflow-hidden bg-slate-900 shadow-2xl">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-800 bg-slate-800/50 backdrop-blur-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Unified Chat</h3>
                </div>

                <div className="flex items-center gap-3">
                    {/* Status Badge & List */}
                    <div className="relative group z-20">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 shadow-sm hover:border-indigo-500/50 transition-all cursor-pointer">
                            <span className={`w-2 h-2 rounded-full ${activeKeys.length > 0 ? 'bg-emerald-500' : 'bg-red-500'} shadow-[0_0_8px_rgba(16,185,129,0.4)]`}></span>
                            <span className="text-[10px] text-slate-300 font-black uppercase tracking-wider">{activeKeys.length} ACTIVE</span>
                        </div>

                        {/* Dropdown List */}
                        <div className="absolute top-full right-0 mt-2 w-72 bg-slate-900 rounded-2xl shadow-2xl shadow-black/60 border border-slate-800 p-4 hidden group-hover:block animate-in fade-in zoom-in-95 duration-200 z-30">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Key Inventory</span>
                                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">{activeKeys.length}</span>
                            </div>

                            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                {activeKeys.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic py-4 text-center">No active keys in vault</p>
                                ) : (
                                    activeKeys.map(k => (
                                        <div key={k.id} className="flex flex-col p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all border border-slate-800/50 hover:border-slate-700 group/item">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${k.verificationStatus === 'valid' ? 'bg-emerald-500' : k.verificationStatus === 'testing' ? 'bg-amber-500' : 'bg-slate-600'}`}></span>
                                                    <span className="text-xs text-slate-200 font-bold truncate" title={k.label}>{k.label}</span>
                                                </div>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 opacity-60 group-hover/item:opacity-100 transition-opacity">{k.providerId}</span>
                                            </div>

                                            {/* Model List */}
                                            <div className="pl-4">
                                                {k.verifiedModels && k.verifiedModels.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {k.verifiedModels.slice(0, 4).map(m => (
                                                            <span key={m} className="text-[9px] px-1.5 py-0.5 bg-slate-900/50 border border-slate-700/50 rounded-md text-slate-400 font-mono">{m}</span>
                                                        ))}
                                                        {k.verifiedModels.length > 4 && (
                                                            <span className="text-[9px] text-slate-500 font-bold">+{k.verifiedModels.length - 4}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] text-slate-600 italic">Discovery pending...</span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Selectors */}
                    <div className="flex items-center gap-2">
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="text-[11px] font-bold bg-slate-800 border-slate-700 text-slate-300 rounded-lg focus:ring-indigo-500/20 focus:border-indigo-500/50 py-1.5 cursor-pointer uppercase tracking-wider"
                        >
                            <optgroup label="CAPABILITY ROUTING" className="bg-slate-900 text-slate-500">
                                {MODEL_OPTIONS.map(opt => (
                                    <option key={opt.id} value={opt.id} className="text-slate-200">{opt.label}</option>
                                ))}
                            </optgroup>
                            <optgroup label="DIRECT ACCESS" className="bg-slate-900 text-slate-500">
                                {RAW_MODELS.map(opt => (
                                    <option key={opt.id} value={opt.id} className="text-slate-200">{opt.label}</option>
                                ))}
                            </optgroup>
                        </select>

                        <select
                            value={explicitProvider}
                            onChange={(e) => setExplicitProvider(e.target.value as AIProviderId)}
                            className="text-[11px] font-bold bg-slate-800 border-slate-700 text-slate-500 rounded-lg focus:ring-indigo-500/20 focus:border-indigo-500/50 py-1.5 cursor-pointer uppercase tracking-wider"
                        >
                            <option value="">AUTO DETECT</option>
                            <option value="openai">OPENAI ONLY</option>
                            <option value="anthropic">ANTHROPIC ONLY</option>
                            <option value="gemini">GEMINI ONLY</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-950/30">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600">
                        <div className="p-4 bg-slate-900/50 rounded-2xl mb-4 border border-slate-800">
                            <Terminal className="w-10 h-10 opacity-20" />
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">System Ready</p>
                        <p className="text-[10px] mt-2 max-w-[240px] text-center font-medium leading-relaxed opacity-60">
                            Select an intelligence tier. Failover, model selection, and token management are handled automatically.
                        </p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-xl ${msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-br-none shadow-indigo-500/10'
                            : msg.role === 'error'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20 rounded-bl-none'
                                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                            }`}>
                            <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                            {/* Metadata Footer */}
                            {msg.meta && (
                                <div className="mt-3 pt-3 border-t border-slate-700/50 text-[9px] font-bold uppercase tracking-widest flex flex-wrap gap-2 items-center opacity-80">
                                    <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded-full border border-slate-700/50">
                                        ⏱ {msg.meta.latency}ms
                                    </span>
                                    {msg.meta.model && (
                                        <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded-full border border-slate-700/50 text-indigo-400">
                                            🤖 {msg.meta.model}
                                        </span>
                                    )}
                                    {msg.meta.providerId && (
                                        <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded-full border border-slate-700/50 text-emerald-400">
                                            🏢 {msg.meta.providerId}
                                        </span>
                                    )}
                                    {msg.meta.attempts > 1 && (
                                        <span className="flex items-center gap-1 bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20 animate-pulse">
                                            🛡️ FAILOVER ({msg.meta.attempts} ATTEMPTS)
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 bg-slate-900 border-t border-slate-800">
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Query the swarm..."
                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:ring-indigo-500/20 focus:border-indigo-500/50 shadow-inner px-4 py-3 text-sm transition-all"
                            disabled={isLoading}
                            autoFocus
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="px-6 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm font-black uppercase tracking-widest"
                    >
                        {isLoading ? <Activity className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span className="hidden sm:inline">Dispatch</span>
                    </button>
                </div>
            </form>
        </div>
    );
};
