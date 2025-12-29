
import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import {
    EyeIcon,
    MessageSquareIcon,
    ThumbsUpIcon,
    GlobeIcon,
    LockIcon,
    FilterIcon,
    SearchIcon,
    MoreVerticalIcon,
    PenIcon,
    TrashIcon,
    VideoIcon,
    PlusIcon,
    Loader2,
    AlertCircle,
    RotateCwIcon
} from 'lucide-react';
import MuxVideoPlayer from './MuxVideoPlayer';
import { formatDate } from '../lib/utils';
import MuxAssetImportDialog from './MuxAssetImportDialog';

// Types for our content
interface ContentItem {
    id: string;
    title: string;
    description?: string;
    thumbnail?: string;
    duration: number; // in seconds
    status: 'public' | 'private' | 'unlisted' | 'processing';
    createdAt: string; // ISO date
    views: number;
    averageViewDuration?: string;
    asset_id?: string;
    playback_id?: string | null;
    engagement?: {
        total_views: number;
        total_watch_time: number;
        formatted_watch_time: string;
        average_view_duration: number;
    };
}

const ContentLibrary: React.FC = () => {
    const [videos, setVideos] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
    const [showImportDialog, setShowImportDialog] = useState(false);

    // Effect to fetch real assets if available
    useEffect(() => {
        const fetchAssets = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // Try to fetch real assets from Mux
                const response = await fetch('/mux/user-assets');
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.status === 'success' && Array.isArray(data.assets)) {
                        // Transform Mux assets to ContentItem format
                        const mappedAssets: ContentItem[] = data.assets.map((asset: any) => ({
                            id: asset.asset_id,
                            asset_id: asset.asset_id,
                            title: asset.title || `Video ${asset.asset_id}`,
                            description: `Asset ID: ${asset.asset_id}`,
                            duration: asset.duration || 0,
                            status: asset.status === 'ready' ? 'public' : 'processing',
                            createdAt: asset.created_at ? new Date(asset.created_at * 1000).toISOString() : new Date().toISOString(),
                            views: asset.engagement?.total_views || 0,
                            averageViewDuration: asset.engagement?.formatted_watch_time || '0m',
                            playback_id: asset.playback_id || null,
                            engagement: asset.engagement || {
                                total_views: 0,
                                total_watch_time: 0,
                                formatted_watch_time: '0m',
                                average_view_duration: 0
                            }
                        }));

                        setVideos(mappedAssets);
                        console.log("✅ Fetched Mux Assets:", mappedAssets);
                    } else if (data.status === 'success' && (!data.assets || data.assets.length === 0)) {
                        setVideos([]); // Explicitly set empty
                    }
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || `Server error: ${response.status}`);
                }

            } catch (error) {
                console.error("Failed to fetch Mux assets:", error);
                let errorMessage = "Failed to load assets. Please try again later.";

                if (error instanceof Error) {
                    if (error.message.includes('Failed to fetch')) {
                        errorMessage = "Could not connect to Mux service. Please check your internet connection and try again.";
                    } else if (error.message.includes('Mux service not available')) {
                        errorMessage = "Mux service is not available. Please check your backend configuration and ensure MUX_TOKEN_ID is set.";
                    } else if (error.message.includes('404')) {
                        errorMessage = "Mux API endpoint not found. Please check the API configuration.";
                    } else {
                        errorMessage = error.message;
                    }
                }

                setError(errorMessage);
                setVideos([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAssets();
    }, []);
    const toggleVideoSelection = (id: string) => {
        const newSet = new Set(selectedVideos);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedVideos(newSet);
    };
    const toggleAll = () => {
        if (selectedVideos.size === videos.length) {
            setSelectedVideos(new Set());
        } else {
            setSelectedVideos(new Set(videos.map(v => v.id)));
        }
    };
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    const refreshAssets = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/mux/user-assets');
            if (response.ok) {
                const data = await response.json();
                if (data && data.status === 'success' && Array.isArray(data.assets)) {
                    const mappedAssets: ContentItem[] = data.assets.map((asset: any) => ({
                        id: asset.asset_id,
                        asset_id: asset.asset_id,
                        title: asset.title || `Video ${asset.asset_id}`,
                        description: `Asset ID: ${asset.asset_id}`,
                        duration: asset.duration || 0,
                        status: asset.status === 'ready' ? 'public' : 'processing',
                        createdAt: asset.created_at
                            ? (typeof asset.created_at === 'number'
                                ? new Date(asset.created_at * 1000).toISOString()
                                : new Date(asset.created_at).toISOString())
                            : new Date().toISOString(),
                        views: asset.engagement?.total_views || 0,
                        averageViewDuration: asset.engagement?.formatted_watch_time || '0m',
                        playback_id: asset.playback_id || null,
                        engagement: asset.engagement || {
                            total_views: 0,
                            total_watch_time: 0,
                            formatted_watch_time: '0m',
                            average_view_duration: 0
                        }
                    }));

                    setVideos(mappedAssets);
                    console.log("🔄 Refreshed Mux Assets:", mappedAssets);
                }
            }
        } catch (error) {
            console.error("Failed to refresh assets:", error);
            setError("Failed to refresh assets. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <div className="flex-1 bg-background/50 p-6 sm:p-8 overflow-y-auto h-full flex flex-col">
            <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col space-y-6">

                {/* Header */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-foreground">Channel content</h1>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowImportDialog(true)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-sm text-sm font-medium transition-colors"
                            >
                                <PlusIcon className="w-4 h-4" />
                                Upload a video
                            </button>
                            <button
                                onClick={refreshAssets}
                                className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-sm text-sm font-medium transition-colors"
                                title="Refresh assets"
                            >
                                <RotateCwIcon className="w-4 h-4" />
                                Refresh
                            </button>
                        </div>
                    </div>
                    {/* Filters Toolbar */}
                    <div className="flex items-center gap-2 border-b border-border pb-4">
                        <div className="relative flex-1 max-w-md">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Filter"
                                className="w-full bg-background border border-border rounded-sm py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 rounded-sm text-sm font-medium text-muted-foreground transition-colors">
                            <FilterIcon className="w-4 h-4" />
                            Filter
                        </button>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-muted-foreground">Loading your video assets...</p>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 bg-red-50 dark:bg-red-950/20 p-6 rounded-lg border border-red-200 dark:border-red-900">
                            <AlertCircle className="w-8 h-8 text-red-600" />
                            <p className="text-red-600 dark:text-red-400">{error}</p>
                            <button
                                onClick={refreshAssets}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {/* Content Table */}
                {!isLoading && !error && videos.length > 0 && (
                    <div className="bg-card border border-border rounded-md flex-1 overflow-hidden flex flex-col">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                {/* Table Header */}
                                <thead className="bg-muted/30 text-xs font-semibold text-muted-foreground uppercase sticky top-0 border-b border-border z-10">
                                    <tr>
                                        <th className="p-4 w-[50px] text-center">
                                            <input
                                                type="checkbox"
                                                className="accent-primary cursor-pointer"
                                                checked={videos.length > 0 && selectedVideos.size === videos.length}
                                                onChange={toggleAll}
                                            />
                                        </th>
                                        <th className="p-4 w-[40%]">Video</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Date</th>
                                        <th className="p-4 text-right">Views</th>
                                        <th className="p-4 text-right">Avg Watch Time</th>
                                    </tr>
                                </thead>

                                {/* Table Body */}
                                <tbody className="divide-y divide-border bg-card">
                                    {videos.map((video) => (
                                        <tr
                                            key={video.id}
                                            className={cn(
                                                "group hover:bg-muted/20 transition-colors",
                                                selectedVideos.has(video.id) && "bg-primary/5"
                                            )}
                                        >
                                            {/* Checkbox */}
                                            <td className="p-4 text-center align-top pt-6">
                                                <input
                                                    type="checkbox"
                                                    className="accent-primary cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity data-[checked=true]:opacity-100"
                                                    checked={selectedVideos.has(video.id)}
                                                    onChange={() => toggleVideoSelection(video.id)}
                                                    data-checked={selectedVideos.has(video.id)}
                                                />
                                            </td>

                                            {/* Video Info */}
                                            <td className="p-4 align-top">
                                                <div className="flex gap-4">
                                                    {/* Thumbnail Placeholder */}
                                                    <div className="relative w-32 h-18 bg-muted rounded-md flex-shrink-0 overflow-hidden group/thumb cursor-pointer">
                                                        {video.playback_id ? (
                                                            <MuxVideoPlayer
                                                                playbackId={video.playback_id}
                                                                className="w-full h-full"
                                                                muted
                                                                autoPlay={false}
                                                            />
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                                                                <VideoIcon className="w-6 h-6 text-muted-foreground" />
                                                            </div>
                                                        )}
                                                        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                                                            {formatDuration(video.duration)}
                                                        </div>
                                                        {/* Hover Overlay */}
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                            <button className="p-1 hover:text-white text-gray-300"><EyeIcon className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>

                                                    {/* Meta */}
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <h3 className="text-sm font-medium text-foreground truncate cursor-pointer hover:text-primary transition-colors">
                                                            {video.title}
                                                        </h3>
                                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                                            {video.description}
                                                        </p>

                                                        {/* Engagement Info */}
                                                        {video.engagement && (
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                <span className="font-medium">{video.engagement.total_views} views</span>
                                                                <span className="mx-1">•</span>
                                                                <span>{video.engagement.formatted_watch_time} watch time</span>
                                                            </div>
                                                        )}

                                                        {/* Hover Actions Row */}
                                                        <div className="h-6 flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button className="p-1 text-muted-foreground hover:text-primary" title="Details">
                                                                <PenIcon className="w-4 h-4" />
                                                            </button>
                                                            <button className="p-1 text-muted-foreground hover:text-primary" title="Analytics">
                                                                <FilterIcon className="w-4 h-4" /> {/* Fallback icon for analytics */}
                                                            </button>
                                                            <button className="p-1 text-muted-foreground hover:text-primary" title="Comments">
                                                                <MessageSquareIcon className="w-4 h-4" />
                                                            </button>
                                                            <button className="p-1 text-muted-foreground hover:text-red-500 ml-2" title="Delete">
                                                                <TrashIcon className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Visibility */}
                                            <td className="p-4 align-top pt-6">
                                                <div className="flex items-center gap-2 text-sm text-foreground">
                                                    {video.status === 'public' && <GlobeIcon className="w-4 h-4 text-green-500" />}
                                                    {video.status === 'private' && <LockIcon className="w-4 h-4 text-muted-foreground" />}
                                                    {video.status === 'unlisted' && <EyeIcon className="w-4 h-4 text-muted-foreground" />}
                                                    {video.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />}
                                                    <span className="capitalize">{video.status}</span>
                                                </div>
                                            </td>

                                            {/* Date */}
                                            <td className="p-4 align-top pt-6">
                                                <div className="text-sm text-foreground">
                                                    {new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>
                                                <div className="text-xs text-muted-foreground">Published</div>
                                            </td>

                                            {/* Stats Columns */}
                                            <td className="p-4 text-right align-top pt-6 text-sm">
                                                {video.views.toLocaleString()}
                                            </td>
                                            <td className="p-4 text-right align-top pt-6 text-sm">
                                                {video.engagement?.formatted_watch_time || '0m'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Footer / Pagination Placeholder */}
                        <div className="border-t border-border p-3 text-xs text-muted-foreground flex justify-end gap-4 bg-muted/10">
                            <span>Rows per page: 10</span>
                            <span>1-{videos.length} of {videos.length}</span>
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && videos.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <VideoIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold">No content yet</h3>
                            <p className="text-muted-foreground text-sm">Upload your first video to get started with analysis and insights.</p>
                            <button
                                onClick={() => setShowImportDialog(true)}
                                className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                <PlusIcon className="w-4 h-4 inline-block mr-2" />
                                Upload Video
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Mux Asset Import Dialog */}
            <MuxAssetImportDialog
                open={showImportDialog}
                onOpenChange={setShowImportDialog}
                onImportSuccess={() => {
                    // Refresh videos list after successful import
                    refreshAssets();
                }}
                onAnalyzeSuccess={(videoId) => {
                    // Refresh videos list after successful analysis
                    refreshAssets();
                    console.log('Video analyzed:', videoId);
                }}
            />
        </div>
    );
};
export default ContentLibrary;
