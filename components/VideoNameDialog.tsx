import React, { useState } from 'react';
import { Dialog, DialogContent } from './ui/dialog';

interface VideoNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (videoName: string) => void;
  defaultName: string;
}

const VideoNameDialog: React.FC<VideoNameDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  defaultName
}) => {
  const [videoName, setVideoName] = useState(defaultName);

  const handleConfirm = () => {
    const trimmedName = videoName.trim();
    if (trimmedName) {
      onConfirm(trimmedName);
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Name Your Video"
        onClose={() => onOpenChange(false)}
        className="w-[400px]"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              Video Name
            </label>
            <input
              type="text"
              value={videoName}
              onChange={(e) => setVideoName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Matrix Fight Scene, Product Demo, etc."
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
              This name will be used as the video ID for searching and organizing your analysis.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={!videoName.trim()}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Continue
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/80 transition-colors border border-border shadow-sm hover:shadow-md"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoNameDialog;
