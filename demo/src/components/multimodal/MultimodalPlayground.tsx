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
        <div className="relative min-h-screen py-10">
            {/* Background Orbs for 'Vibe' */}
            <div className="absolute top-0 right-0 -z-10 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-0 left-0 -z-10 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full" />

            {/* Header Section */}
            <div className="mb-12 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100/50 text-indigo-600 text-[10px] font-black uppercase tracking-[0.2em] animate-in slide-in-from-top-4 duration-700">
                    <Sparkles className="w-3 h-3" />
                    Multimodal Suite
                </div>
                <h2 className="text-4xl font-black text-slate-800 tracking-tighter sm:text-5xl animate-in slide-in-from-top-8 duration-1000">
                    Creative <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Forge</span>
                </h2>
                <p className="max-w-2xl text-slate-500 font-medium leading-relaxed">
                    Unleash the full power of multimodal AI. Generate stunning imagery, 
                    vectorize intelligence for RAG, and breathe life into text with neural speech.
                </p>
            </div>

            {/* Main Content Layout - 'Broken'/Dynamic Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                
                {/* Image Gen - Primary Block */}
                <div className="xl:col-span-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                <div className="xl:col-span-12 mt-8">
                    <div className="flex flex-wrap gap-4 items-center p-6 bg-slate-900/5 backdrop-blur-md border border-slate-200/50 rounded-3xl">
                        <div className="flex items-center gap-3 pr-6 border-r border-slate-200">
                            <Zap className="w-4 h-4 text-amber-500" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Low Latency APIs</span>
                        </div>
                        <div className="flex items-center gap-3 pr-6 border-r border-slate-200">
                            <Layers className="w-4 h-4 text-indigo-500" />
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Multi-Provider Router</span>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                             <div className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 text-[9px] font-bold">READY</div>
                             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Toast */}
            {error && (
                <div className="fixed bottom-8 right-8 z-50 p-4 bg-red-600 text-white rounded-2xl shadow-2xl shadow-red-500/40 flex items-center gap-3 animate-in fade-in slide-in-from-right-8 duration-300">
                    <Zap className="w-5 h-5 text-red-200" />
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">Engine Error</p>
                        <p className="text-sm font-medium">{error.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

