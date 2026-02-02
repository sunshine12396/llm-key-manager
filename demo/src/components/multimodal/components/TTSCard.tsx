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
        <div className="relative group bg-white/40 backdrop-blur-xl border border-white/40 rounded-3xl p-6 shadow-2xl shadow-amber-500/10 flex flex-col h-full transition-all duration-500 hover:shadow-amber-500/20 hover:border-white/60">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                        <Headphones className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Aural Engine</h3>
                        <p className="text-[10px] text-amber-500 font-bold">ALLOY VOICE</p>
                    </div>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>

            <div className="relative mb-6">
                <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter text to speak..."
                    className="w-full text-sm bg-white/50 border-0 rounded-2xl p-4 h-32 resize-none focus:ring-2 focus:ring-amber-500/50 transition-all placeholder:text-slate-400 shadow-inner"
                />
            </div>

            <button 
                onClick={handleGenerate}
                disabled={isLoading || !input.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-amber-500/40 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
            >
                {isLoading ? (
                    <Activity className="w-4 h-4 animate-spin text-white/80" />
                ) : (
                    <>
                        <Mic className="w-4 h-4" />
                        Generate Audio
                    </>
                )}
            </button>

            {audioUrl && (
                <div className="mt-6 p-1 bg-white/60 rounded-full border border-white/80 shadow-inner flex items-center gap-3 pr-4 animate-in fade-in zoom-in-95 duration-500">
                    <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0">
                        <Volume2 className="w-5 h-5" />
                    </div>
                    <audio 
                        src={audioUrl} 
                        controls 
                        className="flex-1 h-8 [&::-webkit-media-controls-enclosure]:bg-transparent [&::-webkit-media-controls-panel]:bg-transparent" 
                    />
                </div>
            )}
        </div>
    );
};
