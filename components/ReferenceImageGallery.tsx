import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import ReferenceImageCard from './ReferenceImageCard';
import { SearchIcon, TagIcon } from './icons';
import { cn } from '../lib/utils';

interface ReferenceImage {
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
  created_at: string;
}

interface ReferenceImageGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (referenceImage: ReferenceImage) => void;
  selectedReferences?: string[];
  activeReferences?: string[];
}

const ReferenceImageGallery: React.FC<ReferenceImageGalleryProps> = ({
  open,
  onOpenChange,
  onSelect,
  selectedReferences = [],
  activeReferences = []
}) => {
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'environment_lock' | 'object_reference' | 'lipsync_reference'>('all');

  // Mock data for demonstration
  useEffect(() => {
    if (open) {
      loadReferences();
    }
  }, [open]);

  const loadReferences = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/v1/reference-images');
      // const data = await response.json();
      
      // Mock data for now
      const mockData: ReferenceImage[] = [
        {
          id: '1',
          firebase_url: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400',
          usage_type: 'environment_lock',
          metadata: {
            width: 1920,
            height: 1080,
            format: 'JPEG',
            aspect_ratio: 1.78,
            average_color: 'rgb(45,45,45)'
          },
          description: 'Modern office building exterior',
          is_starred: true,
          times_used: 3,
          user_rating: 5,
          created_at: '2024-12-27T10:00:00Z'
        },
        {
          id: '2',
          firebase_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
          usage_type: 'object_reference',
          metadata: {
            width: 800,
            height: 600,
            format: 'PNG',
            aspect_ratio: 1.33,
            average_color: 'rgb(120,120,120)'
          },
          description: 'Red sports car',
          is_starred: false,
          times_used: 1,
          user_rating: 4,
          created_at: '2024-12-27T09:30:00Z'
        },
        {
          id: '3',
          firebase_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
          usage_type: 'lipsync_reference',
          metadata: {
            width: 512,
            height: 512,
            format: 'JPEG',
            aspect_ratio: 1.0,
            average_color: 'rgb(180,160,140)'
          },
          description: 'Professional headshot',
          is_starred: false,
          times_used: 0,
          user_rating: undefined,
          created_at: '2024-12-27T08:45:00Z'
        }
      ];
      
      setTimeout(() => {
        setReferences(mockData);
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Failed to load references:', error);
      setLoading(false);
    }
  };

  const filteredReferences = references.filter(ref => {
    const matchesSearch = !searchQuery || 
      ref.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ref.usage_type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterType === 'all' || ref.usage_type === filterType;
    
    return matchesSearch && matchesFilter;
  });

  const handleSelect = (id: string) => {
    const reference = references.find(ref => ref.id === id);
    if (reference) {
      onSelect(reference);
      onOpenChange(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // TODO: Replace with actual API call
      // await fetch(`/api/v1/reference-images/${id}`, { method: 'DELETE' });
      setReferences(prev => prev.filter(ref => ref.id !== id));
    } catch (error) {
      console.error('Failed to delete reference:', error);
    }
  };

  const handleStar = async (id: string) => {
    try {
      const reference = references.find(ref => ref.id === id);
      if (!reference) return;

      // TODO: Replace with actual API call
      // await fetch(`/api/v1/reference-images/${id}`, { 
      //   method: 'PUT', 
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ is_starred: !reference.is_starred })
      // });

      setReferences(prev => prev.map(ref => 
        ref.id === id ? { ...ref, is_starred: !ref.is_starred } : ref
      ));
    } catch (error) {
      console.error('Failed to star reference:', error);
    }
  };

  const getFilterCounts = () => {
    const counts = {
      all: references.length,
      environment_lock: references.filter(r => r.usage_type === 'environment_lock').length,
      object_reference: references.filter(r => r.usage_type === 'object_reference').length,
      lipsync_reference: references.filter(r => r.usage_type === 'lipsync_reference').length,
    };
    return counts;
  };

  const filterCounts = getFilterCounts();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" 
        title="Reference Image Gallery"
        onClose={() => onOpenChange(false)}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <TagIcon className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Reference Image Gallery</h2>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden space-y-4 p-6">
          {/* Search and Filter Controls */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search references..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('all')}
              >
                All ({filterCounts.all})
              </Button>
              <Button
                variant={filterType === 'environment_lock' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('environment_lock')}
              >
                🏠 Environment ({filterCounts.environment_lock})
              </Button>
              <Button
                variant={filterType === 'object_reference' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('object_reference')}
              >
                🎯 Objects ({filterCounts.object_reference})
              </Button>
              <Button
                variant={filterType === 'lipsync_reference' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterType('lipsync_reference')}
              >
                👄 Lip-sync ({filterCounts.lipsync_reference})
              </Button>
            </div>
          </div>

          {/* References Grid */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-muted-foreground">Loading references...</div>
              </div>
            ) : filteredReferences.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-center">
                <div className="space-y-2">
                  <TagIcon className="w-12 h-12 text-muted-foreground mx-auto" />
                  <div className="text-muted-foreground">
                    {searchQuery || filterType !== 'all' 
                      ? 'No references found matching your criteria'
                      : 'No reference images yet. Upload some to get started!'
                    }
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                {filteredReferences.map(reference => (
                  <ReferenceImageCard
                    key={reference.id}
                    {...reference}
                    isSelected={selectedReferences.includes(reference.id)}
                    isActive={activeReferences.includes(reference.id)}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                    onStar={handleStar}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferenceImageGallery;
