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
import { ChatInterface } from './components/chat/ChatInterface';
import { AvailabilityMonitor } from './components/availability/AvailabilityMonitor';
import { SafetyControlPanel } from './components/safety/SafetyControlPanel';
import { MultimodalPlayground } from './components/multimodal/MultimodalPlayground';
import '../../lib/styles/index.css';

const App = () => {
    return (
        <LLMKeyManagerProvider>
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <header className="bg-white border-b sticky top-0 z-40 backdrop-blur-md bg-white/80">
                    <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">🔐</span>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 leading-tight">LLM Key Manager</h1>
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Secure Client-Side Vault</p>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full space-y-12">
                    <section aria-label="Key Management">
                        <KeyListDashboard />
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        <section className="xl:col-span-2 space-y-8" aria-label="Playground">
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
                                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                        <span className="text-lg">💬</span> Unified Chat
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <ChatInterface />
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 border-l-4 border-indigo-500">
                                <MultimodalPlayground />
                            </div>
                        </section>

                        <aside className="space-y-6" aria-label="Monitoring">
                            <UsageDashboard />
                            <AvailabilityMonitor />
                            <ErrorLogs />
                            <SafetyControlPanel />
                        </aside>
                    </div>
                </main>

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
