import { cn } from '../../lib/utils';

interface SkeletonProps {
    className?: string;
}

function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-muted/50',
                className
            )}
        />
    );
}

// Pre-built skeleton variants
function SkeletonCard({ className }: SkeletonProps) {
    return (
        <div className={cn("p-4 space-y-3", className)}>
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
        </div>
    );
}

function SkeletonText({ lines = 3, className }: SkeletonProps & { lines?: number }) {
    return (
        <div className={cn("space-y-2", className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className={cn(
                        "h-4",
                        i === lines - 1 ? "w-2/3" : "w-full"
                    )}
                />
            ))}
        </div>
    );
}

function SkeletonAvatar({ className }: SkeletonProps) {
    return <Skeleton className={cn("h-10 w-10 rounded-full", className)} />;
}

function SkeletonVideo({ className }: SkeletonProps) {
    return (
        <div className={cn("space-y-3", className)}>
            <Skeleton className="aspect-video w-full rounded-lg" />
            <div className="flex gap-3">
                <SkeletonAvatar />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
        </div>
    );
}

function SkeletonTable({ rows = 5, cols = 4, className }: SkeletonProps & { rows?: number; cols?: number }) {
    return (
        <div className={cn("space-y-3", className)}>
            {/* Header */}
            <div className="flex gap-4">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-4">
                    {Array.from({ length: cols }).map((_, colIndex) => (
                        <Skeleton key={colIndex} className="h-8 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    );
}

export {
    Skeleton,
    SkeletonCard,
    SkeletonText,
    SkeletonAvatar,
    SkeletonVideo,
    SkeletonTable
};
