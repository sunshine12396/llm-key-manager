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

    if (!isUnlocked) return <div className="p-8 text-center text-gray-500">Please unlock the vault first to use the chat.</div>;

    return (
        <div className="flex flex-col h-[600px] border rounded-xl overflow-hidden bg-white shadow-sm">
            {/* Toolbar */}
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Unified Chat</h3>
                </div>

                <div className="flex items-center gap-3">
                    {/* Status Badge & List */}
                    <div className="relative group z-20">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-md border shadow-sm hover:border-indigo-300 transition-colors cursor-default">
                            <span className={`w-2 h-2 rounded-full ${activeKeys.length > 0 ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                            <span className="text-xs text-gray-700 font-bold">{activeKeys.length}</span>
                        </div>

                        {/* Dropdown List */}
                        <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-gray-100 p-3 hidden group-hover:block animate-in fade-in zoom-in-95 duration-200 z-30">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Available Keys</span>
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{activeKeys.length}</span>
                            </div>

                            <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {activeKeys.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic py-2 text-center">No active keys</p>
                                ) : (
                                    activeKeys.map(k => (
                                        <div key={k.id} className="flex flex-col p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${k.verificationStatus === 'valid' ? 'bg-emerald-500' : k.verificationStatus === 'testing' ? 'bg-amber-500' : 'bg-gray-300'}`}></span>
                                                    <span className="text-xs text-gray-700 font-medium truncate" title={k.label}>{k.label}</span>
                                                </div>
                                                <span className="text-[9px] uppercase tracking-wider text-gray-400 flex-shrink-0 ml-2 border border-gray-100 px-1 rounded bg-white">{k.providerId}</span>
                                            </div>

                                            {/* Model List */}
                                            <div className="pl-3.5">
                                                {k.verifiedModels && k.verifiedModels.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {k.verifiedModels.slice(0, 4).map(m => (
                                                            <span key={m} className="text-[9px] px-1 bg-white border border-gray-200 rounded-md text-gray-500 shadow-sm">{m}</span>
                                                        ))}
                                                        {k.verifiedModels.length > 4 && (
                                                            <span className="text-[9px] text-gray-400 flex items-center">+{k.verifiedModels.length - 4}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] text-gray-300 italic">No verified models</span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Model Selector */}
                    <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-1.5 font-medium"
                    >
                        <optgroup label="Auto-Switching Enabled">
                            {MODEL_OPTIONS.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                        </optgroup>
                        <optgroup label="Direct Model Access">
                            {RAW_MODELS.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                        </optgroup>
                    </select>

                    {/* Provider Override (Optional) */}
                    <select
                        value={explicitProvider}
                        onChange={(e) => setExplicitProvider(e.target.value as AIProviderId)}
                        className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 py-1.5 text-gray-500"
                    >
                        <option value="">Auto-Detect Provider</option>
                        <option value="openai">Force OpenAI</option>
                        <option value="anthropic">Force Anthropic</option>
                        <option value="gemini">Force Gemini</option>
                    </select>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <Terminal className="w-12 h-12 mb-4 opacity-20" />
                        <p className="font-medium">Ready to chat.</p>
                        <p className="text-xs mt-1 max-w-xs text-center">
                            Select a capability (Fast, Smart, Coding) and we will automatically route to the best available provider and key.
                        </p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-br-none'
                            : msg.role === 'error'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                            }`}>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                            {/* Metadata Footer */}
                            {msg.meta && (
                                <div className="mt-2 pt-2 border-t border-gray-100/20 text-[10px] opacity-70 flex flex-wrap gap-2 items-center">
                                    <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded">⏱ {msg.meta.latency}ms</span>
                                    {msg.meta.model && (
                                        <span className="flex items-center gap-1 bg-black/5 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                            🤖 {msg.meta.model}
                                        </span>
                                    )}
                                    {msg.meta.providerId && (
                                        <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded capitalize">
                                            🏢 {msg.meta.providerId}
                                        </span>
                                    )}
                                    {msg.meta.attempts > 1 && (
                                        <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded animate-pulse font-semibold">
                                            🛡️ Resilient Failover ({msg.meta.attempts} attempts)
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
            <form onSubmit={handleSend} className="p-4 bg-white border-t">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 rounded-lg border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                        disabled={isLoading}
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2 font-medium"
                    >
                        {isLoading ? <Activity className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
};
