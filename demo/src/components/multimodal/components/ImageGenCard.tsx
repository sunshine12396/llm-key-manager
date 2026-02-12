import React, { useState } from 'react';
import { Image, Sparkles, Activity, Download, RefreshCw } from 'lucide-react';

interface ImageGenCardProps {
    generateImage: (params: any) => Promise<any>;
    isLoading: boolean;
}

export const ImageGenCard: React.FC<ImageGenCardProps> = ({ generateImage, isLoading }) => {
    const [prompt, setPrompt] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        try {
            const res = await generateImage({
                model: 'dall-e-3',
                prompt: prompt,
                size: '1024x1024'
            });
            if (res.data[0]?.url) {
                setImageUrl(res.data[0].url);
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="relative group bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/40 flex flex-col h-full transition-all duration-500 hover:border-indigo-500/30">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5 transition-transform group-hover:scale-110 duration-500">
                        <Image className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-slate-200 uppercase tracking-[0.2em] mb-1">Visual synthesis</h3>
                        <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest">DALL·E 3 Cluster</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Link Active</span>
                </div>
            </div>

            <div className="relative mb-8">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter visual coordinates..."
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-2xl p-5 h-40 resize-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 text-slate-200 shadow-inner font-medium leading-relaxed"
                />
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Sparkles className="w-4 h-4 text-indigo-400/50" />
                </div>
            </div>

            <button
                onClick={handleGenerate}
                disabled={isLoading || !prompt.trim()}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-2xl hover:shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-3 border border-indigo-500/50 group/btn overflow-hidden relative"
            >
                <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000 skew-x-12" />
                {isLoading ? (
                    <Activity className="w-4 h-4 animate-spin text-white/80" />
                ) : (
                    <>
                        <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700" />
                        Execute Rendering
                    </>
                )}
            </button>

            {imageUrl && (
                <div className="mt-8 relative group/img aspect-square rounded-2xl overflow-hidden border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-500 group-hover:border-slate-700 transition-colors">
                    <img
                        src={imageUrl}
                        alt="Generated"
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover/img:scale-110"
                    />
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                        <button
                            onClick={() => window.open(imageUrl, '_blank')}
                            className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-full hover:bg-white/20 text-white transition-all transform translate-y-4 group-hover/img:translate-y-0 duration-500"
                        >
                            <Download className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
