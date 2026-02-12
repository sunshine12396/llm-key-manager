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
        <div className="relative group bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/40 flex flex-col h-full transition-all duration-500 hover:border-emerald-500/30">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5 transition-transform group-hover:scale-110 duration-500">
                        <Database className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-slate-200 uppercase tracking-[0.2em] mb-1">Vector conversion</h3>
                        <p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Semantic Core</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Active</span>
                </div>
            </div>

            <div className="relative mb-8">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Input semantic stream..."
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-2xl p-5 h-40 resize-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all placeholder:text-slate-600 text-slate-200 shadow-inner font-medium leading-relaxed"
                />
            </div>

            <button
                onClick={handleGenerate}
                disabled={isLoading || !input.trim()}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-2xl hover:shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3 border border-emerald-500/50"
            >
                {isLoading ? (
                    <Activity className="w-4 h-4 animate-spin text-white/80" />
                ) : (
                    <>
                        <FileText className="w-4 h-4" />
                        Generate Vector
                    </>
                )}
            </button>

            {result && (
                <div className="mt-8 flex-1 flex flex-col min-h-0 animate-in slide-in-from-bottom-2 duration-500">
                    <div className="flex justify-between items-center mb-3 px-1">
                        <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">
                            Dimension: {result.length}
                        </span>
                        <button
                            onClick={handleCopy}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700/50 transition-all shadow-lg"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex-1 bg-slate-950 rounded-2xl p-5 font-mono text-[10px] text-emerald-500/80 overflow-y-auto custom-scrollbar break-all leading-relaxed shadow-inner border border-slate-800/50 h-48">
                        <span className="text-emerald-500/30">[</span>
                        {result.map((n, i) => (
                            <span key={i}>
                                {n.toFixed(4)}
                                {i < result.length - 1 && <span className="text-emerald-500/20">, </span>}
                            </span>
                        ))}
                        <span className="text-emerald-500/30">]</span>
                    </div>
                </div>
            )}
        </div>
    );
};
