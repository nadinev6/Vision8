import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react'; // Assuming lucide-react is available via icons or direct import
import { VideoIcon } from './icons';
import { getUserAssetsWithEngagement } from '../lib/mux';

interface MetricCardProps {
    title: string;
    value: string;
    change?: string;
    isPositive?: boolean;
    active: boolean;
    onClick: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, isPositive, active, onClick }) => (
    <div
        onClick={onClick}
        className={cn(
            "p-6 rounded-xl border cursor-pointer transition-all duration-200",
            active
                ? "bg-card border-primary shadow-sm ring-1 ring-primary/20"
                : "bg-card border-border hover:border-primary/50"
        )}
    >
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        <h3 className="text-2xl font-bold mt-2 text-foreground">{value}</h3>
        {change && (
            <div className="flex items-center mt-2 gap-1 text-xs">
                {isPositive ? (
                    <ArrowUpIcon className="w-3 h-3 text-green-500" />
                ) : (
                    <ArrowDownIcon className="w-3 h-3 text-red-500" />
                )}
                <span className={cn("font-medium", isPositive ? "text-green-500" : "text-red-500")}>
                    {change}
                </span>
                <span className="text-muted-foreground ml-1">vs previous 28 days</span>
            </div>
        )}
    </div>
);

const AnalyticsDashboard: React.FC = () => {
    const [activeMetric, setActiveMetric] = useState<'views' | 'watchTime'>('views');
    const [analyticsData, setAnalyticsData] = useState<any>(null);
    const [chartData, setChartData] = useState<any[]>([]);
    const [topVideos, setTopVideos] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [realtimeViewers, setRealtimeViewers] = useState(0);

    // Fetch real analytics data
    useEffect(() => {
        const fetchAnalytics = async () => {
            setIsLoading(true);
            try {
                // Fetch Global Analytics (Mux Data API)
                const backendUrl = import.meta.env?.VITE_BACKEND_URL || '';
                const globalResponse = await fetch(`${backendUrl}/mux/analytics/global`);
                if (globalResponse.ok) {
                    const result = await globalResponse.json();

                    // Whether "real" or "mock_or_empty", we use the data structure if present
                    // If no real data, values will be 0 from backend or mock fallback
                    setAnalyticsData(result);

                    if (result.chart_data && Array.isArray(result.chart_data)) {
                        const mappedChartData = result.chart_data.map((item: any) => ({
                            name: new Date(item[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                            views: Number(item[1]),
                            watchTime: 0
                        }));
                        setChartData(mappedChartData);
                    }

                    // Simple mock for realtime viewers if not provided
                    setRealtimeViewers(result.unique_viewers?.value > 0 ? Math.floor(result.unique_viewers.value * 0.1) : 0);
                }

                // Fetch Top Videos (using user assets with engagement)
                const assetsResult = await getUserAssetsWithEngagement("7:days");
                if (assetsResult && assetsResult.assets) {
                    // Sort by total views descending
                    const sortedAssets = [...assetsResult.assets].sort((a, b) =>
                        (b.engagement.total_views || 0) - (a.engagement.total_views || 0)
                    ).slice(0, 5); // Top 5

                    setTopVideos(sortedAssets.map(asset => ({
                        id: asset.asset_id,
                        title: asset.title || 'Untitled Video',
                        views: asset.engagement.total_views?.toString() || '0',
                        duration: formatDuration(asset.duration),
                        date: asset.created_at ? new Date(asset.created_at).toLocaleDateString() : 'Unknown'
                    })));
                }

            } catch (err) {
                console.error("Failed to fetch real analytics", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const viewValue = analyticsData?.total_views ?
        (analyticsData.total_views >= 1000 ? `${(analyticsData.total_views / 1000).toFixed(1)}K` : analyticsData.total_views.toString())
        : "0";

    const watchTimeValue = analyticsData?.formatted_watch_time || "0s";

    // Fallback empty state if chart data is empty
    const displayChartData = chartData.length > 0 ? chartData : [
        { name: 'No Data', views: 0, watchTime: 0 }
    ];

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">Loading Analytics...</div>;
    }

    return (
        <div className="flex-1 bg-background/50 p-6 sm:p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-foreground">Channel analytics (Mux Data)</h1>
                    <div className="flex gap-2">
                        <span className="px-3 py-1 bg-secondary text-secondary-foreground text-sm font-medium rounded-full">Last 7 days</span>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <MetricCard
                        title="Views"
                        value={viewValue}
                        active={activeMetric === 'views'}
                        onClick={() => setActiveMetric('views')}
                    />
                    <MetricCard
                        title="Unique Viewers"
                        value={(analyticsData?.unique_viewers || 0).toString()}
                        active={false}
                        onClick={() => { }}
                    />
                    <MetricCard
                        title="Playing Time"
                        value={watchTimeValue}
                        active={activeMetric === 'watchTime'}
                        onClick={() => setActiveMetric('watchTime')}
                    />
                    <MetricCard
                        title="Avg Play Time"
                        value={analyticsData?.formatted_avg_duration || "0:00"}
                        active={false}
                        onClick={() => { }}
                    />
                    <MetricCard
                        title="Avg Completion"
                        value={analyticsData?.avg_completion_percentage ? `${Math.round(analyticsData.avg_completion_percentage)}%` : "0%"}
                        active={false}
                        onClick={() => { }}
                    />
                </div>

                {/* Chart Section */}
                <div className="bg-card border border-border rounded-xl p-6 h-[400px]">
                    <h3 className="text-lg font-semibold mb-6">{activeMetric === 'views' ? 'Views' : 'Watch Time'} over time</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={displayChartData}>
                            <defs>
                                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Area
                                type="monotone"
                                dataKey={activeMetric}
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorMetric)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Bottom Section: Top Videos */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Top Content List */}
                    <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col">
                        <div className="p-6 border-b border-border">
                            <h3 className="text-lg font-semibold">Top content</h3>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {topVideos.length > 0 ? (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-muted/30 text-xs uppercase text-muted-foreground sticky top-0">
                                        <tr>
                                            <th className="p-4 font-medium">Video</th>
                                            <th className="p-4 font-medium text-right">Date</th>
                                            <th className="p-4 font-medium text-right">Views</th>
                                            <th className="p-4 font-medium text-right">Duration</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {topVideos.map((video) => (
                                            <tr key={video.id} className="hover:bg-muted/20 transition-colors">
                                                <td className="p-4 flex items-center gap-3">
                                                    <div className="w-10 h-6 bg-muted rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                        <VideoIcon className="w-4 h-4 text-muted-foreground" />
                                                    </div>
                                                    <span className="font-medium text-sm text-foreground truncate max-w-[200px]">{video.title}</span>
                                                </td>
                                                <td className="p-4 text-sm text-muted-foreground text-right">{video.date}</td>
                                                <td className="p-4 text-sm font-medium text-foreground text-right">{video.views}</td>
                                                <td className="p-4 text-sm text-muted-foreground text-right">{video.duration}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-8 text-center text-muted-foreground">
                                    No videos found. Upload content to see analytics.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Realtime / Latest Activity */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-2">Realtime</h3>
                        <div className="space-y-1 mb-6">
                            <p className="text-sm text-muted-foreground">Live activity (est)</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-bold text-foreground">{realtimeViewers}</span>
                                <span className="text-sm text-muted-foreground">Active Viewers</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
