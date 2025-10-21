import React, { useState } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { SparklesIcon, ChevronDownIcon } from './icons';

interface VideoGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (model: string, frameData: any) => void;
  selectedFrameRange?: { start: number; end: number; duration: number };
  videoName?: string;
}

const VideoGenerationDialog: React.FC<VideoGenerationDialogProps> = ({
  open,
  onOpenChange,
  onGenerate,
  selectedFrameRange,
  videoName = 'Current Video'
}) => {
  const [includeAudio, setIncludeAudio] = useState(false);

  const model = {
    id: 'veo3-fast',
    name: 'Veo 3 Fast',
    description: 'Google\'s optimized video generation model for faster processing',
    badge: ''
  };

  const handleGenerate = () => {
    const frameData = {
      videoName,
      startFrame: selectedFrameRange?.start || 0,
      endFrame: selectedFrameRange?.end || 0,
      duration: selectedFrameRange?.duration || 0,
      totalFrames: selectedFrameRange ? selectedFrameRange.end - selectedFrameRange.start : 0,
      includeAudio
    };

    onGenerate('veo3-fast', frameData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Generate Video"
        onClose={() => onOpenChange(false)}
        className="w-[480px] sm:max-w-xl min-h-[420px] max-h-none overflow-y-visible"
      >
        <div className="space-y-6">
          {/* Frame Range Info */}
          <div className="p-4 bg-muted rounded-lg border border-border">
            <h3 className="text-sm font-medium text-foreground mb-2">Source Video</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium">Video:</span> {videoName}</p>
              {selectedFrameRange && (
                <>
                  <p><span className="font-medium">Frame Range:</span> {selectedFrameRange.start} - {selectedFrameRange.end}</p>
                  <p><span className="font-medium">Duration:</span> {selectedFrameRange.duration.toFixed(1)}s</p>
                  <p><span className="font-medium">Total Frames:</span> {selectedFrameRange.end - selectedFrameRange.start}</p>
                </>
              )}
            </div>
          </div>

          {/* AI Model Info */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">AI Model</label>
            <div className="p-3 border border-border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-foreground">{model.name}</span>
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-white dark:text-blue-300">
                  {model.badge}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{model.description}</p>
            </div>
          </div>

          {/* Audio Options */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Audio Options</label>
            <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
                className="w-4 h-4 text-primary border-border rounded focus:ring-primary focus:ring-2"
              />
              <div className="flex-1">
                <span className="font-medium text-foreground">Include Audio Generation</span>
              </div>
            </label>
          </div>



          {/* Generate Button */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm hover:shadow-md"
            >
              <SparklesIcon className="w-5 h-5" />
              Generate Video
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors border border-border shadow-sm hover:shadow-md"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoGenerationDialog;