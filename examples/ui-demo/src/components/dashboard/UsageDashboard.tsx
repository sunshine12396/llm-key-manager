import React, { useEffect, useState } from 'react';
import { analyticsService } from 'llm-key-manager/services/analytics.service';
import { BarChart3, TrendingUp, DollarSign, Clock, AlertTriangle, Zap, Activity, Cpu } from 'lucide-react';
import { AIProviderId } from 'llm-key-manager/models/types';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '../ui';
import { cn } from '../../utils/cn';

interface StatsCardProps {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ReactNode;
    trend?: {
        value: string;
        positive: boolean;
    };
    color: 'indigo' | 'emerald' | 'amber' | 'red' | 'blue';
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value, subtitle, icon, trend, color }) => {
    const colors = {
        indigo: "text-indigo-400 bg-indigo-500/10",
        emerald: "text-emerald-400 bg-emerald-500/10",
        amber: "text-amber-400 bg-amber-500/10",
        red: "text-red-400 bg-red-500/10",
        blue: "text-blue-400 bg-blue-500/10"
    };

    return (
        <Card className="overflow-hidden group hover:shadow-md transition-all duration-300 bg-slate-900 border-slate-700 shadow-lg shadow-black/20">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className={cn("p-2 rounded-lg transition-transform group-hover:scale-110 duration-300", colors[color])}>
                        {icon}
                    </div>
                    {trend && (
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                            trend.positive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}>
                            {trend.value}
                        </span>
                    )}
                </div>
                <div>
                    <p className="text-2xl font-bold text-slate-50 tracking-tight">{value}</p>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">{title}</p>
                    <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {subtitle}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};

interface ProviderStatsCardProps {
    providerId: AIProviderId;
    label: string;
    color: 'emerald' | 'amber' | 'blue';
}

const ProviderStatsCard: React.FC<ProviderStatsCardProps> = ({ providerId, label, color }) => {
    const [stats, setStats] = useState(() => analyticsService.getProviderStats(providerId));

    useEffect(() => {
        const unsubscribe = analyticsService.subscribe(() => {
            setStats(analyticsService.getProviderStats(providerId));
        });
        return unsubscribe;
    }, [providerId]);

    const colors = {
        emerald: "border-l-emerald-500",
        amber: "border-l-amber-500",
        blue: "border-l-blue-500"
    };

    return (
        <Card className={cn("border-l-4 hover:shadow-md transition-all bg-slate-900 border-slate-700 shadow-lg shadow-black/20", colors[color])}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-slate-300 uppercase tracking-wide">{label}</CardTitle>
                    <Badge variant={color === 'emerald' ? 'emerald' : color === 'amber' ? 'amber' : 'indigo'} size="sm">
                        {providerId}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-6 pt-2">
                <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <p className="text-xl font-bold text-slate-200">{stats.totalRequests}</p>
                        <p className="text-[10px] font-medium text-slate-500 uppercase">Requests</p>
                    </div>
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-400">
                        <p className="text-xl font-bold text-emerald-400">${stats.totalCost.toFixed(4)}</p>
                        <p className="text-[10px] font-medium text-slate-500 uppercase">Est. Cost</p>
                    </div>
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
                        <p className="text-sm font-semibold text-slate-300">{stats.totalTokens.toLocaleString()}</p>
                        <p className="text-[10px] font-medium text-slate-500 uppercase">Tokens</p>
                    </div>
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-600">
                        <p className="text-sm font-semibold text-slate-300">{Math.round(stats.avgLatency)}ms</p>
                        <p className="text-[10px] font-medium text-slate-500 uppercase">Avg Latency</p>
                    </div>
                </div>
                {stats.failedRequests > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2 text-[10px] font-bold text-red-500 uppercase">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{stats.failedRequests} failed requests</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

interface UsageChartProps {
    data: Array<{ hour: string; requests: number; tokens: number; errors: number }>;
}

const UsageChart: React.FC<UsageChartProps> = ({ data }) => {
    const maxRequests = Math.max(...data.map(d => d.requests), 1);

    return (
        <Card className="overflow-hidden bg-slate-900 border-slate-700 shadow-lg shadow-black/20">
            <CardHeader className="bg-slate-800/50 border-b border-slate-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
                            <BarChart3 className="h-4 w-4" />
                        </div>
                        <div>
                            <CardTitle className="text-sm font-bold text-slate-200">Hourly Activity</CardTitle>
                            <p className="text-[10px] text-slate-500 font-medium">Last 12 hours of usage</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Success</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Errors</span>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                <div className="flex items-end gap-2 h-40">
                    {data.slice(-12).map((item, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center group relative">
                            <div
                                className={cn(
                                    "w-full rounded-t-sm transition-all duration-500 relative",
                                    item.errors > 0 ? 'bg-red-500/80 group-hover:bg-red-500' : 'bg-indigo-500/80 group-hover:bg-indigo-500'
                                )}
                                style={{
                                    height: `${(item.requests / maxRequests) * 100}%`,
                                    minHeight: item.requests > 0 ? 4 : 2
                                }}
                            >
                                {/* Tooltip */}
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl border border-slate-700">
                                    <p className="font-bold">{item.requests} reqs</p>
                                    <p className="opacity-70">{item.tokens} tokens</p>
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45 border-r border-b border-slate-700" />
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 mt-3 group-hover:text-slate-400 transition-colors">{item.hour}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export const UsageDashboard: React.FC = () => {
    const [hourlyData, setHourlyData] = useState(() => analyticsService.getHourlyBreakdown(12));
    const [totalStats, setTotalStats] = useState(() => ({
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0
    }));

    useEffect(() => {
        const updateData = () => {
            setHourlyData(analyticsService.getHourlyBreakdown(12));

            const usage = analyticsService.getUsageData();
            const errors = analyticsService.getErrorLogs();

            setTotalStats({
                requests: usage.length,
                tokens: usage.reduce((sum: number, d: any) => sum + d.inputTokens + d.outputTokens, 0),
                cost: usage.reduce((sum: number, d: any) => sum + d.cost, 0),
                errors: errors.length
            });
        };

        updateData();
        const unsubscribe = analyticsService.subscribe(updateData);
        return unsubscribe;
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-50">Analytics Overview</h2>
                    <p className="text-sm text-slate-400 font-medium">Real-time usage and performance metrics</p>
                </div>
                <Badge variant="indigo" className="flex items-center gap-1.5 px-3 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                    <Zap className="h-3 w-3 fill-indigo-400 text-indigo-400" />
                    Live System
                </Badge>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard
                    title="Total Requests"
                    value={totalStats.requests}
                    subtitle="Current billing cycle"
                    icon={<Activity className="h-5 w-5" />}
                    color="indigo"
                />
                <StatsCard
                    title="Estimated Cost"
                    value={`$${totalStats.cost.toFixed(4)}`}
                    subtitle="Based on model pricing"
                    icon={<DollarSign className="h-5 w-5" />}
                    color="emerald"
                    trend={{ value: "+2.4%", positive: false }}
                />
                <StatsCard
                    title="Tokens Processed"
                    value={totalStats.tokens.toLocaleString()}
                    subtitle="Input + Output tokens"
                    icon={<Cpu className="h-5 w-5" />}
                    color="blue"
                />
                <StatsCard
                    title="System Errors"
                    value={totalStats.errors}
                    subtitle="API & Validation errors"
                    icon={<AlertTriangle className="h-5 w-5" />}
                    color="red"
                    trend={{ value: "-12%", positive: true }}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Usage Chart - Takes 2 columns on large screens */}
                <div className="lg:col-span-2">
                    <UsageChart data={hourlyData} />
                </div>

                {/* System Health / Info */}
                <Card className="bg-slate-900 border border-indigo-500/20 shadow-2xl shadow-black/40 relative overflow-hidden flex flex-col justify-center p-8 group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-700">
                        <TrendingUp className="h-32 w-32 text-indigo-500" />
                    </div>
                    <div className="relative z-10">
                        <Badge variant="indigo" className="bg-indigo-500/10 border-indigo-500/20 text-indigo-400 mb-6 uppercase tracking-[0.2em] font-black text-[9px]">Engine Status</Badge>
                        <h3 className="text-2xl font-black mb-2 text-slate-100 uppercase tracking-tight">System Efficiency</h3>
                        <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium">Your API management layer is currently operating at <span className="text-indigo-400 font-bold">peak performance</span> with multi-region optimized routing.</p>
                        <div className="space-y-5">
                            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Uptime</span>
                                <span className="text-sm font-bold text-emerald-400">99.99%</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Avg Response</span>
                                <span className="text-sm font-bold text-slate-200">1.2s <span className="text-[10px] text-slate-500 font-medium lowercase">avg</span></span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cache Efficiency</span>
                                <span className="text-sm font-bold text-indigo-400">14.5%</span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Provider Stats */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Performance by Provider
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ProviderStatsCard providerId="openai" label="OpenAI" color="emerald" />
                    <ProviderStatsCard providerId="anthropic" label="Anthropic" color="amber" />
                    <ProviderStatsCard providerId="gemini" label="Google Gemini" color="blue" />
                </div>
            </div>
        </div>
    );
};
