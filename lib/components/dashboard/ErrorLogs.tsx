import React, { useEffect, useState } from 'react';
import { analyticsService, ErrorLogEntry } from '../../services';
import { AlertCircle, RefreshCw, Trash2, Clock, Wifi, Key, Server, Gauge, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge, Button, useConfirm } from '../ui';

const errorTypeIcons: Record<ErrorLogEntry['errorType'], React.ReactNode> = {
    rate_limit: <Gauge className="h-3.5 w-3.5" />,
    auth: <Key className="h-3.5 w-3.5" />,
    server: <Server className="h-3.5 w-3.5" />,
    network: <Wifi className="h-3.5 w-3.5" />,
    quota: <ShieldAlert className="h-3.5 w-3.5" />,
    unknown: <AlertCircle className="h-3.5 w-3.5" />
};

const errorTypeLabels: Record<ErrorLogEntry['errorType'], string> = {
    rate_limit: 'Rate Limited',
    auth: 'Auth Error',
    server: 'Server Error',
    network: 'Connect Error',
    quota: 'No Quota',
    unknown: 'Unknown'
};

const errorTypeVariants: Record<ErrorLogEntry['errorType'], 'default' | 'indigo' | 'emerald' | 'amber' | 'red' | 'slate'> = {
    rate_limit: 'amber',
    auth: 'red',
    server: 'red',
    network: 'slate',
    quota: 'amber',
    unknown: 'red'
};

export const ErrorLogs: React.FC = () => {
    const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
    const { confirm, ConfirmDialog } = useConfirm();

    useEffect(() => {
        const updateLogs = () => {
            setLogs(analyticsService.getErrorLogs().reverse());
        };

        updateLogs();
        const unsubscribe = analyticsService.subscribe(updateLogs);
        return unsubscribe;
    }, []);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const handleClear = async () => {
        const confirmed = await confirm({
            title: 'Clear All Logs?',
            message: 'This will permanently remove all error logs from this session. This cannot be undone.',
            confirmText: 'Clear All',
            variant: 'warning'
        });
        if (confirmed) {
            analyticsService.clearAll();
        }
    };

    if (logs.length === 0) {
        return (
            <Card className="p-8 text-center border-dashed">
                <div className="flex flex-col items-center gap-4 text-slate-300">
                    <div className="p-4 bg-slate-50 rounded-full border border-slate-100">
                        <AlertCircle className="h-8 w-8 text-slate-200" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Health Clear</p>
                        <p className="text-xs text-slate-400 mt-1">No system errors detected</p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <>
            <Card className="overflow-hidden border-red-100/50 shadow-sm animate-in fade-in duration-500">
                <CardHeader className="px-5 py-4 border-b border-red-50 bg-red-50/20 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100/50 text-red-600 rounded-lg">
                            <ShieldAlert className="h-4 w-4" />
                        </div>
                        <div>
                            <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
                                Incident Logs
                                <Badge variant="red" size="sm" className="bg-red-100 border-red-200">
                                    {logs.length}
                                </Badge>
                            </CardTitle>
                            <p className="text-[10px] text-slate-500 font-medium">Real-time system failure tracking</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        className="h-8 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                        <Trash2 className="h-3 w-3 mr-1.5" />
                        Purge
                    </Button>
                </CardHeader>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                    {logs.slice(0, 50).map((log, index) => (
                        <div key={index} className="px-5 py-4 hover:bg-slate-50/50 transition-colors group">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <Badge variant={errorTypeVariants[log.errorType]} size="sm" className="h-6 flex gap-1.5 items-center normal-case px-2 mt-1">
                                        {errorTypeIcons[log.errorType]}
                                        <span className="text-[9px] font-bold uppercase tracking-tight">{errorTypeLabels[log.errorType]}</span>
                                    </Badge>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800 leading-relaxed">{log.message}</p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <Badge variant="slate" size="sm" className="bg-slate-100/50 text-[9px] font-bold">{log.providerId}</Badge>
                                            {log.retryCount > 0 && (
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider bg-amber-50 px-1.5 py-0.5 rounded-full">
                                                    <RefreshCw className="h-2.5 w-2.5" />
                                                    {log.retryCount} Retries
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
                                        <Clock className="h-3 w-3" />
                                        {formatTime(log.timestamp)}
                                    </span>
                                    <Badge variant="outline" size="sm" className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                                        ID: {log.timestamp % 10000}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">End of Incident Log Record</p>
                </div>
            </Card>
            <ConfirmDialog />
        </>
    );
};
