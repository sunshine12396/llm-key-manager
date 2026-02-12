import React, { useState } from 'react';
import { Headphones, Activity, Volume2, Mic } from 'lucide-react';

interface TTSCardProps {
    textToSpeech: (params: any) => Promise<any>;
    isLoading: boolean;
}

export const TTSCard: React.FC<TTSCardProps> = ({ textToSpeech, isLoading }) => {
    const [input, setInput] = useState('');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!input.trim()) return;
        try {
            const res = await textToSpeech({
                model: 'tts-1',
                input: input,
                voice: 'alloy'
            });
            const blob = new Blob([res.audioContent], { type: res.contentType });
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="relative group bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/40 flex flex-col h-full transition-all duration-500 hover:border-amber-500/30">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20 shadow-lg shadow-amber-500/5 transition-transform group-hover:scale-110 duration-500">
                        <Headphones className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-slate-200 uppercase tracking-[0.2em] mb-1">Aural synthesis</h3>
                        <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest">Neural Stream</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Online</span>
                </div>
            </div>

            <div className="relative mb-8">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter linguistic variables..."
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-2xl p-5 h-40 resize-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all placeholder:text-slate-600 text-slate-200 shadow-inner font-medium leading-relaxed"
                />
            </div>

            <button
                onClick={handleGenerate}
                disabled={isLoading || !input.trim()}
                className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-2xl hover:shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3 border border-amber-500/50"
            >
                {isLoading ? (
                    <Activity className="w-4 h-4 animate-spin text-white/80" />
                ) : (
                    <>
                        <Mic className="w-4 h-4" />
                        Execute Vocalization
                    </>
                )}
            </button>

            {audioUrl && (
                <div className="mt-8 p-2 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex items-center gap-4 pr-6 animate-in fade-in zoom-in-95 duration-500 group/player hover:border-amber-500/20 transition-all">
                    <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20 group-hover/player:scale-105 transition-transform">
                        <Volume2 className="w-6 h-6" />
                    </div>
                    <audio
                        src={audioUrl}
                        controls
                        className="flex-1 h-8 filter invert hue-rotate-180 opacity-70 hover:opacity-100 transition-opacity"
                    />
                </div>
            )}
        </div>
    );
};
