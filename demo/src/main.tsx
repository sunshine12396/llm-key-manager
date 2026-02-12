import React from 'react';
import ReactDOM from 'react-dom/client';
// Import from library
import {
    LLMKeyManagerProvider,
    KeyListDashboard,
    UsageDashboard,
    ErrorLogs,
    ValidationNotificationToast,
} from '../../lib';
import {
    ShieldCheck,
    MessageSquare,
} from 'lucide-react';
import { ChatInterface } from './components/chat/ChatInterface';
import { AvailabilityMonitor } from './components/availability/AvailabilityMonitor';
import { SafetyControlPanel } from './components/safety/SafetyControlPanel';
import { MultimodalPlayground } from './components/multimodal/MultimodalPlayground';
import '../../lib/styles/index.css';

const App = () => {
    return (
        <LLMKeyManagerProvider>
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
                <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
                    <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                                <ShieldCheck className="h-6 w-6 text-indigo-400" />
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-slate-50 leading-tight tracking-tight uppercase">
                                    LLM <span className="text-indigo-400">Vault</span>
                                </h1>
                                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Secure Client-Side Manager</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex flex-col items-end mr-4">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Status</span>
                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    Operational
                                </span>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-16">
                    <section aria-label="Key Management" className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <KeyListDashboard />
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                        <section className="xl:col-span-8 space-y-10" aria-label="Playground">
                            <div className="bg-slate-900 rounded-3xl shadow-2xl shadow-black/40 border border-slate-800 overflow-hidden group hover:border-indigo-500/30 transition-all duration-500">
                                <div className="px-6 py-5 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                                    <h2 className="font-bold text-slate-200 flex items-center gap-3 uppercase tracking-wider text-xs">
                                        <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                                            <MessageSquare className="h-4 w-4 text-indigo-400" />
                                        </div>
                                        Unified Intelligence Interface
                                    </h2>
                                    <div className="flex gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                                    </div>
                                </div>
                                <div className="p-0">
                                    <ChatInterface />
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-3xl shadow-2xl shadow-black/40 border-l-[6px] border border-slate-800 border-l-indigo-500 p-8 hover:shadow-indigo-500/5 transition-all duration-500">
                                <MultimodalPlayground />
                            </div>
                        </section>

                        <aside className="xl:col-span-4 space-y-8" aria-label="Monitoring">
                            <div className="space-y-2 mb-4">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] px-1">Infrastructure</h3>
                                <div className="h-px bg-gradient-to-r from-slate-800 to-transparent w-full" />
                            </div>
                            <UsageDashboard />
                            <AvailabilityMonitor />
                            <ErrorLogs />
                            <SafetyControlPanel />
                        </aside>
                    </div>
                </main>

                <footer className="py-8 border-t border-slate-900 bg-slate-950 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.3em]">
                        &copy; 2026 LLM Key Manager • Built for the Frontier
                    </p>
                </footer>

                {/* Background Validation Notifications */}
                <ValidationNotificationToast />
            </div>
        </LLMKeyManagerProvider>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
