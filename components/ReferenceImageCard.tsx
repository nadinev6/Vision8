import React from 'react';
import { cn } from '../lib/utils';
import { ImageIcon, StarIcon, TrashIcon, CopyIcon } from './icons';

interface ReferenceImageCardProps {
  id: string;
  firebase_url: string;
  usage_type: 'environment_lock' | 'object_reference' | 'lipsync_reference';
  metadata: {
    width: number;
    height: number;
    format: string;
    aspect_ratio: number;
    average_color?: string;
  };
  description?: string;
  is_starred?: boolean;
  times_used?: number;
  user_rating?: number;
  isSelected?: boolean;
  isActive?: boolean;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onStar?: (id: string) => void;
  className?: string;
}

const ReferenceImageCard: React.FC<ReferenceImageCardProps> = ({
  id,
  firebase_url,
  usage_type,
  metadata,
  description,
  is_starred = false,
  times_used = 0,
  user_rating,
  isSelected = false,
  isActive = false,
  onSelect,
  onDelete,
  onStar,
  className
}) => {
  const getUsageTypeIcon = () => {
    switch (usage_type) {
      case 'environment_lock':
        return '🏠';
      case 'object_reference':
        return '🎯';
      case 'lipsync_reference':
        return '👄';
      default:
        return '🖼️';
    }
  };

  const getUsageTypeLabel = () => {
    switch (usage_type) {
      case 'environment_lock':
        return 'Environment Lock';
      case 'object_reference':
        return 'Object Reference';
      case 'lipsync_reference':
        return 'Lip-sync Reference';
      default:
        return 'Reference';
    }
  };

  const formatAspectRatio = (ratio: number) => {
    // Convert decimal ratio to common aspect ratios
    if (ratio > 1.7 && ratio < 1.8) return '16:9';
    if (ratio > 0.9 && ratio < 1.1) return '1:1';
    if (ratio > 1.3 && ratio < 1.4) return '4:3';
    return `${ratio.toFixed(2)}:1`;
  };

  return (
    <div
      className={cn(
        "group relative bg-card border border-border rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md",
        isSelected && "ring-2 ring-primary ring-offset-2",
        isActive && "ring-2 ring-green-500 ring-offset-2",
        className
      )}
      onClick={() => onSelect?.(id)}
    >
      {/* Image Preview */}
      <div className="aspect-video bg-muted relative overflow-hidden">
        <img
          src={firebase_url}
          alt={description || getUsageTypeLabel()}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          onError={(e) => {
            // Fallback to icon if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const nextElement = target.nextElementSibling as HTMLElement;
            if (nextElement) {
              nextElement.classList.remove('hidden');
            }
          }}
        />
        <div className="hidden absolute inset-0 flex items-center justify-center bg-muted">
          <ImageIcon className="w-12 h-12 text-muted-foreground" />
        </div>
        
        {/* Usage Type Badge */}
        <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-md px-2 py-1 text-xs font-medium flex items-center gap-1">
          <span>{getUsageTypeIcon()}</span>
          <span className="text-foreground">{getUsageTypeLabel()}</span>
        </div>

        {/* Active Indicator */}
        {isActive && (
          <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}

        {/* Selection Indicator */}
        {isSelected && (
          <div className="absolute bottom-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}

        {/* Hover Actions */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(firebase_url);
            }}
            className="p-2 bg-background/90 rounded-full hover:bg-background transition-colors"
            title="Copy URL"
          >
            <CopyIcon className="w-4 h-4" />
          </button>
          {onStar && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStar(id);
              }}
              className={cn(
                "p-2 bg-background/90 rounded-full hover:bg-background transition-colors",
                is_starred && "text-yellow-500"
              )}
              title={is_starred ? "Unstar" : "Star"}
            >
              <StarIcon className={cn("w-4 h-4", is_starred && "fill-current")} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              className="p-2 bg-background/90 rounded-full hover:bg-background text-red-500 transition-colors"
              title="Delete"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="p-3 space-y-2">
        {description && (
          <p className="text-sm font-medium text-foreground line-clamp-2">{description}</p>
        )}
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{metadata.width}×{metadata.height}</span>
          <span>{formatAspectRatio(metadata.aspect_ratio)}</span>
          <span>{metadata.format}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Used {times_used} times
          </span>
          {user_rating && (
            <div className="flex items-center gap-1">
              <StarIcon className="w-3 h-3 fill-current text-yellow-500" />
              <span className="text-muted-foreground">{user_rating}/5</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferenceImageCard;
