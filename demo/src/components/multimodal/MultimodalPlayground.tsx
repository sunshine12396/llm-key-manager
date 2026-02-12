import React from 'react';
import { useLLM } from '../../../../lib';
import { ImageGenCard } from './components/ImageGenCard';
import { EmbeddingCard } from './components/EmbeddingCard';
import { TTSCard } from './components/TTSCard';
import { Sparkles, Zap, Layers } from 'lucide-react';

export const MultimodalPlayground: React.FC = () => {
    const {
        isLoading,
        error,
        generateImage,
        embeddings,
        textToSpeech
    } = useLLM();

    return (
        <div className="relative">
            {/* Background Orbs for 'Vibe' */}
            <div className="absolute top-0 right-0 -z-10 w-96 h-96 bg-indigo-500/5 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-0 left-0 -z-10 w-96 h-96 bg-emerald-500/5 blur-[120px] rounded-full" />

            {/* Header Section */}
            <div className="mb-12 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-[0.2em] animate-in slide-in-from-top-4 duration-700 shadow-lg shadow-indigo-500/5">
                    <Sparkles className="w-3 h-3" />
                    Neural Capabilities Suite
                </div>
                <h2 className="text-4xl font-black text-slate-50 tracking-tighter sm:text-5xl animate-in slide-in-from-top-8 duration-1000 uppercase">
                    Creative <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-500">Engine</span>
                </h2>
                <p className="max-w-2xl text-slate-400 font-medium leading-relaxed text-sm">
                    Access high-tier multimodal endpoints. Generate visual assets,
                    vectorize data for intelligence pipelines, and synthesize neural audio streams.
                </p>
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">

                {/* Capabilities Blocks */}
                <div className="xl:col-span-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                        <div className="lg:col-span-1 h-full">
                            <ImageGenCard generateImage={generateImage} isLoading={isLoading} />
                        </div>

                        <div className="lg:col-span-1 h-full">
                            <EmbeddingCard embeddings={embeddings} isLoading={isLoading} />
                        </div>

                        <div className="lg:col-span-1 h-full">
                            <TTSCard textToSpeech={textToSpeech} isLoading={isLoading} />
                        </div>
                    </div>
                </div>

                {/* Status/Capabilities Footer */}
                <div className="xl:col-span-12">
                    <div className="flex flex-wrap gap-8 items-center p-8 bg-slate-950/20 backdrop-blur-md border border-slate-800 rounded-3xl group hover:border-indigo-500/20 transition-all duration-300">
                        <div className="flex items-center gap-4 pr-8 md:border-r border-slate-800">
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Zap className="w-4 h-4 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]" />
                            </div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Low Latency Infrastructure</span>
                        </div>
                        <div className="flex items-center gap-4 pr-8 md:border-r border-slate-800">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <Layers className="w-4 h-4 text-indigo-400" />
                            </div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cross-Cloud Routing</span>
                        </div>
                        <div className="md:ml-auto flex items-center gap-3 bg-emerald-500/5 px-4 py-2 rounded-2xl border border-emerald-500/10">
                            <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">System Ready</div>
                            <div className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Toast */}
            {error && (
                <div className="fixed bottom-8 right-8 z-50 p-5 bg-red-600/90 backdrop-blur-lg text-white rounded-2xl shadow-2xl shadow-red-500/40 border border-red-500/50 flex items-center gap-4 animate-in fade-in slide-in-from-right-8 duration-300">
                    <div className="p-2 bg-white/10 rounded-xl">
                        <Zap className="w-5 h-5 text-red-200" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-0.5">Engine Exception</p>
                        <p className="text-sm font-bold tracking-tight">{error.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

