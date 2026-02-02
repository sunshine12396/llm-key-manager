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
        <div className="relative group bg-white/40 backdrop-blur-xl border border-white/40 rounded-3xl p-6 shadow-2xl shadow-indigo-500/10 flex flex-col h-full transition-all duration-500 hover:shadow-indigo-500/20 hover:border-white/60">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                        <Image className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Image Engine</h3>
                        <p className="text-[10px] text-indigo-500 font-bold">DALL·E 3 POWERED</p>
                    </div>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
            </div>

            <div className="relative mb-6">
                <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your vision..."
                    className="w-full text-sm bg-white/50 border-0 rounded-2xl p-4 h-32 resize-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 shadow-inner"
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Sparkles className="w-4 h-4 text-indigo-300" />
                </div>
            </div>

            <button 
                onClick={handleGenerate}
                disabled={isLoading || !prompt.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-indigo-500/40 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
            >
                {isLoading ? (
                    <Activity className="w-4 h-4 animate-spin text-white/80" />
                ) : (
                    <>
                        <RefreshCw className="w-4 h-4" />
                        Create Masterpiece
                    </>
                )}
            </button>

            {imageUrl && (
                <div className="mt-6 relative group/img aspect-square rounded-2xl overflow-hidden border border-white/60 shadow-lg animate-in zoom-in-95 duration-500">
                    <img 
                        src={imageUrl} 
                        alt="Generated" 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button 
                            onClick={() => window.open(imageUrl, '_blank')}
                            className="p-3 bg-white/20 backdrop-blur-md rounded-full hover:bg-white/40 text-white transition-all"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
