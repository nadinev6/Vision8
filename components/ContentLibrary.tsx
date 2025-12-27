
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
    VideoIcon
} from 'lucide-react';
import { formatDate } from '../lib/utils';

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
    comments: number;
    likes: number;
    averageViewDuration?: string;
}

// Mock Data incase API fails or is empty
const MOCK_CONTENT: ContentItem[] = [
    {
        id: '1',
        title: 'Getting Started with Vision8',
        description: 'A quick tour of the main features.',
        duration: 225,
        status: 'public',
        createdAt: '2024-10-24T10:00:00Z',
        views: 1205,
        comments: 34,
        likes: 156
    },
    {
        id: '2',
        title: 'Advanced AI Scene Replacement',
        description: 'How to use Fal.ai for scene generation.',
        duration: 312,
        status: 'public',
        createdAt: '2024-11-12T14:30:00Z',
        views: 856,
        comments: 12,
        likes: 98
    },
    {
        id: '3',
        title: 'Mux Integration Tutorial',
        description: 'Setting up Mux player and analytics.',
        duration: 260,
        status: 'unlisted',
        createdAt: '2024-12-01T09:15:00Z',
        views: 645,
        comments: 8,
        likes: 45
    },
    {
        id: '4',
        title: 'Project Update: December',
        description: 'Weekly team sync recording.',
        duration: 1800,
        status: 'private',
        createdAt: '2024-12-05T16:00:00Z',
        views: 12,
        comments: 0,
        likes: 2
    },
    {
        id: '5',
        title: 'Raw Footage: City Park',
        description: 'Unedited clips for testing.',
        duration: 65,
        status: 'private',
        createdAt: '2024-12-14T08:00:00Z',
        views: 0,
        comments: 0,
        likes: 0
    }
];

const ContentLibrary: React.FC = () => {
    const [videos, setVideos] = useState<ContentItem[]>(MOCK_CONTENT);
    const [isLoading, setIsLoading] = useState(false); // Can enable when fetching real data
    const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());

    // Effect to fetch real assets if available
    useEffect(() => {
        const fetchAssets = async () => {
            try {
                // setIsLoading(true);
                const response = await fetch('/api/v1/mux/assets');
                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data) && data.length > 0) {
                        // Transform Mux assets to ContentItem format
                        const mappedAssets: ContentItem[] = data.map((asset: any) => ({
                            id: asset.id,
                            title: asset.id, // Mux assets might not have titles unless stored in metadata. Using ID as fallback.
                            description: `Asset ID: ${asset.id}`,
                            duration: asset.duration ? asset.duration : 0,
                            status: asset.status === 'ready' ? 'public' : 'processing', // Simplified mapping
                            createdAt: asset.created_at ? new Date(asset.created_at * 1000).toISOString() : new Date().toISOString(),
                            views: 0, // Mux Data API needed for this per-video
                            comments: 0,
                            likes: 0
                        }));
                        // Merge or replace. For now, let's keep mock data for the UI showcase if API returns minimal info
                        // setVideos(mappedAssets); 
                        console.log("Fetched Mux Assets:", mappedAssets);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch Mux assets:", error);
            } finally {
                // setIsLoading(false);
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

    return (
        <div className="flex-1 bg-background/50 p-6 sm:p-8 overflow-y-auto h-full flex flex-col">
            <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col space-y-6">

                {/* Header */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-foreground">Channel content</h1>
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

                {/* Content Table */}
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
                                    <th className="p-4">Visibility</th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4 text-right">Views</th>
                                    <th className="p-4 text-right">Comments</th>
                                    <th className="p-4 text-right">Likes (vs avg)</th>
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
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                                                        <VideoIcon className="w-6 h-6 text-muted-foreground" />
                                                    </div>
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
                                            <div className="flex items-center justify-end gap-1">
                                                <span>{video.comments}</span>
                                                {video.comments > 0 && <MessageSquareIcon className="w-3 h-3 text-muted-foreground" />}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right align-top pt-6 text-sm">
                                            <div className="flex items-center justify-end gap-1">
                                                <span>{video.likes}</span>
                                                <div className="h-1 w-12 bg-muted rounded-full overflow-hidden ml-2">
                                                    <div className="h-full bg-foreground" style={{ width: '90%' }}></div>
                                                </div>
                                            </div>
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
            </div>
        </div>
    );
};

export default ContentLibrary;
