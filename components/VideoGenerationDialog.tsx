import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { SparklesIcon } from './icons';
import { videoGenerationService, GenerationStatus } from '../lib/videoGeneration';

interface VideoGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (model: string, frameData: any) => void;
  selectedFrameRange?: { start: number; end: number; duration: number };
  videoName?: string;
  videoId?: string;
  sceneId?: string;
  videoElement?: HTMLVideoElement;
}

const VideoGenerationDialog: React.FC<VideoGenerationDialogProps> = ({
  open,
  onOpenChange,
  onGenerate,
  selectedFrameRange,
  videoName = 'Current Video',
  videoId,
  sceneId,
  videoElement
}) => {
  const [includeAudio, setIncludeAudio] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('veo3');
  const [selectedQuality, setSelectedQuality] = useState('standard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [supportedModels, setSupportedModels] = useState<string[]>(['veo3', 'sora2']);
  const [qualityPresets, setQualityPresets] = useState<Record<string, any>>({});

  // Load supported models and quality presets on mount
  useEffect(() => {
    const loadGenerationOptions = async () => {
      try {
        const [models, presets] = await Promise.all([
          videoGenerationService.getSupportedModels(),
          videoGenerationService.getQualityPresets()
        ]);
        setSupportedModels(models);
        setQualityPresets(presets);
      } catch (error) {
        console.error('Failed to load generation options:', error);
      }
    };

    if (open) {
      loadGenerationOptions();
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert('Please enter a generation prompt');
      return;
    }

    if (!videoId || !sceneId) {
      alert('Video ID and Scene ID are required for generation');
      return;
    }

    try {
      setIsGenerating(true);

      // Extract reference frame if video element is available
      let referenceFrame: string | undefined;
      if (videoElement && selectedFrameRange) {
        try {
          referenceFrame = await videoGenerationService.extractKeyframe(
            videoElement, 
            selectedFrameRange.start
          );
        } catch (error) {
          console.warn('Failed to extract reference frame:', error);
        }
      }

      // Start generation
      const response = await videoGenerationService.generateScene({
        video_id: videoId,
        scene_id: sceneId,
        prompt: prompt.trim(),
        model: selectedModel,
        quality: selectedQuality,
        duration_seconds: selectedFrameRange?.duration || 5.0,
        reference_frame: referenceFrame,
        style_settings: {
          include_audio: includeAudio
        }
      });

      console.log('Generation started:', response);

      // Poll for status updates
      await videoGenerationService.pollGenerationStatus(
        response.job_id,
        (status) => {
          setGenerationStatus(status);
          console.log('Generation progress:', status);
        }
      );

      // Call the original onGenerate callback for compatibility
      const frameData = {
        videoName,
        startFrame: selectedFrameRange?.start || 0,
        endFrame: selectedFrameRange?.end || 0,
        duration: selectedFrameRange?.duration || 0,
        totalFrames: selectedFrameRange ? selectedFrameRange.end - selectedFrameRange.start : 0,
        includeAudio,
        jobId: response.job_id,
        generationUrl: generationStatus?.generation_url,
        downloadUrl: generationStatus?.download_url,
        streamUrl: generationStatus?.stream_url
      };

      onGenerate(selectedModel, frameData);
      
      // Show download options if generation completed
      if (generationStatus?.status === 'completed' && generationStatus.download_url) {
        const shouldDownload = confirm('Video generation completed! Would you like to download it now?');
        if (shouldDownload) {
          window.open(generationStatus.download_url, '_blank');
        }
      }
      
      // Close dialog on success
      onOpenChange(false);

    } catch (error) {
      console.error('Generation failed:', error);
      alert(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
      setGenerationStatus(null);
    }
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

          {/* AI Model Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="veo3">Veo-3 Fast (Recommended)</option>
              <option value="sora2">Sora-2 (Coming Soon)</option>
            </select>
            <div className="p-3 border border-border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-foreground">
                  {selectedModel === 'veo3' ? 'Veo-3 Fast' : 'Sora-2'}
                </span>
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-100 dark:text-blue-800">
                  {selectedModel === 'veo3' ? 'Google' : 'OpenAI'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedModel === 'veo3' 
                  ? 'High-quality video generation with fast processing times'
                  : 'Advanced video generation with cinematic quality (Coming Soon)'
                }
              </p>
            </div>
          </div>

          {/* Scene Context Preview */}
          <div className="p-4 bg-muted/50 rounded-lg border border-border">
            <h3 className="text-sm font-medium text-foreground mb-2">Current Scene Context</h3>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p><span className="font-medium">Scene ID:</span> {sceneId || 'Not specified'}</p>
              <p><span className="font-medium">Duration:</span> {selectedFrameRange?.duration.toFixed(1)}s</p>
              <p><span className="font-medium">Context:</span> This scene will be analyzed and its metadata preserved unless you specify changes</p>
            </div>
          </div>

          {/* Conversational Modification Prompt */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Modification Instructions
              <span className="text-xs text-muted-foreground ml-2">(Optional - leave empty to regenerate with original context)</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What would you like to change? e.g., 'Replace the red car with a blue bicycle' or 'Change the lighting to golden hour' or 'Remove the person in the background'"
              className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              rows={4}
            />
            <div className="text-xs text-muted-foreground">
              <p><strong>Examples:</strong></p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>"Change the weather from sunny to rainy"</li>
                <li>"Replace the dialogue with: 'Hello, how are you?'"</li>
                <li>"Add a dog running in the background"</li>
                <li>"Make the lighting more dramatic"</li>
              </ul>
            </div>
          </div>

          {/* Quality Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Quality</label>
            <select
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(e.target.value)}
              className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="draft">Draft (480p, Fast)</option>
              <option value="standard">Standard (720p, Balanced)</option>
              <option value="high">High (1080p, Best Quality)</option>
            </select>
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



          {/* Generation Status */}
          {generationStatus && (
            <div className="p-4 bg-muted rounded-lg border border-border">
              <h3 className="text-sm font-medium text-foreground mb-2">Generation Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <span className={`text-sm font-medium ${
                    generationStatus.status === 'completed' ? 'text-green-600' :
                    generationStatus.status === 'failed' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    {generationStatus.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Progress:</span>
                  <span className="text-sm font-medium">{generationStatus.progress}%</span>
                </div>
                {generationStatus.status === 'completed' && generationStatus.generation_url && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => window.open(`http://localhost:8000/api/v1/video/generation/download/${generationStatus.job_id}`, '_blank')}
                      className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => window.open(`http://localhost:8000/api/v1/video/generation/stream/${generationStatus.job_id}`, '_blank')}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Preview
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SparklesIcon className="w-5 h-5" />
              {isGenerating ? 'Generating...' : 'Generate Video'}
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