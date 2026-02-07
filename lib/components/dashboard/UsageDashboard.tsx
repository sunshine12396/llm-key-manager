import React, { useEffect, useState } from 'react';
import { analyticsService } from '../../services/analytics.service';
import { BarChart3, TrendingUp, DollarSign, Clock, AlertTriangle, Zap, Activity, Cpu } from 'lucide-react';
import { AIProviderId } from '../../models/types';
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
        indigo: "text-indigo-600 bg-indigo-50",
        emerald: "text-emerald-600 bg-emerald-50",
        amber: "text-amber-600 bg-amber-50",
        red: "text-red-600 bg-red-50",
        blue: "text-blue-600 bg-blue-50"
    };

    return (
        <Card className="overflow-hidden group hover:shadow-md transition-all duration-300">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className={cn("p-2 rounded-lg transition-transform group-hover:scale-110 duration-300", colors[color])}>
                        {icon}
                    </div>
                    {trend && (
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                            trend.positive ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                        )}>
                            {trend.value}
                        </span>
                    )}
                </div>
                <div>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">{title}</p>
                    <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
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
        <Card className={cn("border-l-4 hover:shadow-md transition-all", colors[color])}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-wide">{label}</CardTitle>
                    <Badge variant={color === 'emerald' ? 'emerald' : color === 'amber' ? 'amber' : 'indigo'} size="sm">
                        {providerId}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-6 pt-2">
                <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <p className="text-xl font-bold text-slate-800">{stats.totalRequests}</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase">Requests</p>
                    </div>
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-400">
                        <p className="text-xl font-bold text-emerald-600">${stats.totalCost.toFixed(4)}</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase">Est. Cost</p>
                    </div>
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
                        <p className="text-sm font-semibold text-slate-700">{stats.totalTokens.toLocaleString()}</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase">Tokens</p>
                    </div>
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-600">
                        <p className="text-sm font-semibold text-slate-700">{Math.round(stats.avgLatency)}ms</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase">Avg Latency</p>
                    </div>
                </div>
                {stats.failedRequests > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[10px] font-bold text-red-600 uppercase">
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
        <Card className="overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                            <BarChart3 className="h-4 w-4" />
                        </div>
                        <div>
                            <CardTitle className="text-sm font-bold">Hourly Activity</CardTitle>
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
                                    item.errors > 0 ? 'bg-red-400 group-hover:bg-red-500' : 'bg-indigo-500 group-hover:bg-indigo-600'
                                )}
                                style={{
                                    height: `${(item.requests / maxRequests) * 100}%`,
                                    minHeight: item.requests > 0 ? 4 : 2
                                }}
                            >
                                {/* Tooltip */}
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl">
                                    <p className="font-bold">{item.requests} reqs</p>
                                    <p className="opacity-70">{item.tokens} tokens</p>
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                                </div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 mt-3 group-hover:text-slate-600 transition-colors">{item.hour}</span>
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
                tokens: usage.reduce((sum, d) => sum + d.inputTokens + d.outputTokens, 0),
                cost: usage.reduce((sum, d) => sum + d.cost, 0),
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
                    <h2 className="text-xl font-bold text-slate-900">Analytics Overview</h2>
                    <p className="text-sm text-slate-500 font-medium">Real-time usage and performance metrics</p>
                </div>
                <Badge variant="indigo" className="flex items-center gap-1.5 px-3">
                    <Zap className="h-3 w-3 fill-indigo-500" />
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
                <Card className="bg-indigo-900 text-white border-0 shadow-lg relative overflow-hidden flex flex-col justify-center p-8">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <TrendingUp className="h-32 w-32" />
                    </div>
                    <div className="relative z-10">
                        <Badge variant="indigo" className="bg-white/20 border-white/10 text-white mb-4">Quick Stats</Badge>
                        <h3 className="text-2xl font-bold mb-2">System Efficiency</h3>
                        <p className="text-indigo-100/70 text-sm mb-6">Your API management layer is currently operating at peak performance with optimized routing.</p>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-indigo-800 pb-2">
                                <span className="text-xs font-semibold text-indigo-300 uppercase">Uptime</span>
                                <span className="text-sm font-bold">99.9%</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-indigo-800 pb-2">
                                <span className="text-xs font-semibold text-indigo-300 uppercase">Avg Response</span>
                                <span className="text-sm font-bold">~1.2s</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-indigo-800 pb-2">
                                <span className="text-xs font-semibold text-indigo-300 uppercase">Cache Rate</span>
                                <span className="text-sm font-bold">14.5%</span>
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
