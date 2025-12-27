
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react'; // Assuming lucide-react is available via icons or direct import
import { VideoIcon } from './icons';

// Mock Data
const data = [
    { name: 'Jan 1', views: 4000, watchTime: 240 },
    { name: 'Jan 5', views: 3000, watchTime: 139 },
    { name: 'Jan 10', views: 2000, watchTime: 980 },
    { name: 'Jan 15', views: 2780, watchTime: 390 },
    { name: 'Jan 20', views: 1890, watchTime: 480 },
    { name: 'Jan 25', views: 2390, watchTime: 380 },
    { name: 'Jan 30', views: 3490, watchTime: 430 },
];

const topVideos = [
    { id: 1, title: 'Getting Started with Vision8', views: '1.2K', duration: '3:45', date: 'Oct 24, 2024' },
    { id: 2, title: 'Advanced AI Scene Replacement', views: '856', duration: '5:12', date: 'Nov 12, 2024' },
    { id: 3, title: 'Mux Integration Tutorial', views: '645', duration: '4:20', date: 'Dec 01, 2024' },
    { id: 4, title: 'Understanding Analytics', views: '432', duration: '2:30', date: 'Dec 05, 2024' },
];

interface MetricCardProps {
    title: string;
    value: string;
    change: string;
    isPositive: boolean;
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
    </div>
);

const AnalyticsDashboard: React.FC = () => {
    const [activeMetric, setActiveMetric] = useState<'views' | 'watchTime'>('views');
    const [analyticsData, setAnalyticsData] = useState<any>(null);
    const [chartData, setChartData] = useState<any[]>(data); // Default to mock data
    const [isLoading, setIsLoading] = useState(true);
    const [isRealData, setIsRealData] = useState(false);

    // Fetch real analytics data if available (optional enhancement)
    useEffect(() => {
        const fetchAnalytics = async () => {
            setIsLoading(true);
            try {
                const backendUrl = import.meta.env?.VITE_BACKEND_URL || '';
                const response = await fetch(`${backendUrl}/api/mux/analytics/global`);
                if (response.ok) {
                    const result = await response.json();
                    if (result && result.status === 'real') {
                        setAnalyticsData(result);
                        setIsRealData(true);

                        // Process timeseries data for the chart if available
                        if (result.chart_data && Array.isArray(result.chart_data) && result.chart_data.length > 0) {
                            // Mux returns [timestamp, value], need to map to { name: 'Date', views: Value }
                            const mappedChartData = result.chart_data.map((item: any) => ({
                                name: new Date(item[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                                views: Number(item[1]),
                                watchTime: 0 // We only fetched views timeseries for now
                            }));
                            setChartData(mappedChartData);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch real analytics", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

    // Use real data if available, otherwise fallback to mock
    const viewValue = analyticsData?.total_views ?
        (analyticsData.total_views >= 1000 ? `${(analyticsData.total_views / 1000).toFixed(1)}K` : analyticsData.total_views.toString())
        : "12.5K";
    const watchTimeValue = analyticsData?.formatted_watch_time || "450h";
    const uniqueViewers = analyticsData?.unique_viewers || 0;

    return (
        <div className="flex-1 bg-background/50 p-6 sm:p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-foreground">Channel analytics</h1>
                    <div className="flex gap-2">
                        <span className="px-3 py-1 bg-secondary text-secondary-foreground text-sm font-medium rounded-full">Last 28 days</span>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <MetricCard
                        title="Views"
                        value={viewValue}
                        change="12%"
                        isPositive={true}
                        active={activeMetric === 'views'}
                        onClick={() => setActiveMetric('views')}
                    />
                    <MetricCard
                        title="Watch Time (hours)"
                        value={watchTimeValue}
                        change="5%"
                        isPositive={true}
                        active={activeMetric === 'watchTime'}
                        onClick={() => setActiveMetric('watchTime')}
                    />
                    <MetricCard
                        title="Avg View Duration"
                        value="3:12"
                        change="1.2%"
                        isPositive={false}
                        active={false}
                        onClick={() => { }}
                    />
                </div>

                {/* Chart Section */}
                <div className="bg-card border border-border rounded-xl p-6 h-[400px]">
                    <h3 className="text-lg font-semibold mb-6">{activeMetric === 'views' ? 'Views' : 'Watch Time'} over time</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
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

                {/* Bottom Section: Top Videos & Realtime */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Top Content List */}
                    <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col">
                        <div className="p-6 border-b border-border">
                            <h3 className="text-lg font-semibold">Top content in this period</h3>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground sticky top-0">
                                    <tr>
                                        <th className="p-4 font-medium">Video</th>
                                        <th className="p-4 font-medium text-right">Date</th>
                                        <th className="p-4 font-medium text-right">Views</th>
                                        <th className="p-4 font-medium text-right">Avg Duration</th>
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
                        </div>
                        <div className="p-4 border-t border-border text-center">
                            <button className="text-sm text-primary font-medium hover:underline">See more</button>
                        </div>
                    </div>

                    {/* Realtime / Latest Activity */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-2">Realtime</h3>
                        <div className="space-y-1 mb-6">
                            <p className="text-sm text-muted-foreground">Updating live</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-bold text-foreground">84</span>
                                <span className="text-sm text-muted-foreground">Active Viewers</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="h-[150px] w-full bg-muted/20 rounded-lg flex items-end justify-between p-2 gap-1">
                                {/* Fake bar chart for realtime */}
                                {[...Array(15)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="bg-primary/80 rounded-sm w-full"
                                        style={{ height: `${Math.random() * 100}%`, opacity: 0.5 + (Math.random() * 0.5) }}
                                    />
                                ))}
                            </div>
                            <div>
                                <h4 className="text-sm font-medium mb-2">Top Geography</h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">United States</span>
                                        <span className="font-medium">42%</span>
                                    </div>
                                    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-primary h-full" style={{ width: '42%' }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
