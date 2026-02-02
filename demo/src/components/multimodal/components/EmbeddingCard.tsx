import React, { useState } from 'react';
import { Database, Activity, FileText, Copy, Check } from 'lucide-react';

interface EmbeddingCardProps {
    embeddings: (params: any) => Promise<any>;
    isLoading: boolean;
}

export const EmbeddingCard: React.FC<EmbeddingCardProps> = ({ embeddings, isLoading }) => {
    const [input, setInput] = useState('');
    const [result, setResult] = useState<number[] | null>(null);
    const [copied, setCopied] = useState(false);

    const handleGenerate = async () => {
        if (!input.trim()) return;
        try {
            const res = await embeddings({
                model: 'text-embedding-3-small',
                input: input
            });
            setResult(res.data[0].embedding);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCopy = () => {
        if (!result) return;
        navigator.clipboard.writeText(JSON.stringify(result));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group bg-white/40 backdrop-blur-xl border border-white/40 rounded-3xl p-6 shadow-2xl shadow-emerald-500/10 flex flex-col h-full transition-all duration-500 hover:shadow-emerald-500/20 hover:border-white/60">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                        <Database className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Vector Engine</h3>
                        <p className="text-[10px] text-emerald-500 font-bold">RAG READY</p>
                    </div>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <div className="relative mb-6">
                <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter text to vectorize..."
                    className="w-full text-sm bg-white/50 border-0 rounded-2xl p-4 h-32 resize-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-slate-400 shadow-inner"
                />
            </div>

            <button 
                onClick={handleGenerate}
                disabled={isLoading || !input.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-emerald-500/40 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
            >
                {isLoading ? (
                    <Activity className="w-4 h-4 animate-spin text-white/80" />
                ) : (
                    <>
                        <FileText className="w-4 h-4" />
                        Generate Embedding
                    </>
                )}
            </button>

            {result && (
                <div className="mt-6 flex-1 flex flex-col min-h-0 animate-in slide-in-from-bottom-2 duration-500">
                    <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">
                            {result.length} Dimensions
                        </span>
                        <button 
                            onClick={handleCopy}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                        >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                    <div className="flex-1 bg-slate-900 rounded-2xl p-4 font-mono text-[9px] text-emerald-400 overflow-y-auto custom-scrollbar break-all leading-relaxed shadow-inner border border-white/10">
                        <span className="opacity-40">[</span>
                        {result.map((n, i) => (
                            <span key={i}>
                                {n.toFixed(4)}
                                {i < result.length - 1 && <span className="opacity-20">, </span>}
                            </span>
                        ))}
                        <span className="opacity-40">]</span>
                    </div>
                </div>
            )}
        </div>
    );
};
