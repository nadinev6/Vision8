import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { AiGenerate2Line } from './svg.tsx';
import { videoGenerationService, GenerationStatus } from '../lib/videoGeneration';
import { CreditWarning, useCreditsRemaining, estimateGenerationCost } from './CreditWarning';

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
  const [selectedModel, setSelectedModel] = useState('wan2.2');
  const [selectedQuality, setSelectedQuality] = useState('standard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [supportedModels, setSupportedModels] = useState<string[]>(['wan2.2']);
  const [qualityPresets, setQualityPresets] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState('references');
  const [userApiKey, setUserApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const { creditsRemaining } = useCreditsRemaining(60000);
  const estimatedCost = estimateGenerationCost(selectedQuality as 'draft' | 'standard' | 'high' | 'ultra');

  useEffect(() => {
    const loadGenerationOptions = async () => {
      try {
        console.log('Loading generation options...');
        const [models, presets] = await Promise.all([
          videoGenerationService.getSupportedModels(),
          videoGenerationService.getQualityPresets()
        ]);
        console.log('Loaded models:', models);
        console.log('Loaded presets:', presets);
        setSupportedModels(models);
        setQualityPresets(presets);
      } catch (error) {
        console.error('Failed to load generation options:', error);
        setSupportedModels(['wan2.2']);
        setQualityPresets({
          draft: { resolution: '480p', fps: 24 },
          standard: { resolution: '720p', fps: 30 },
          high: { resolution: '1080p', fps: 30 }
        });
      }
    };

    if (open) {
      loadGenerationOptions();
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!videoId || !sceneId) {
      alert('Video ID and Scene ID are required for generation');
      return;
    }

    const finalPrompt = 'Regenerate this scene maintaining the original context and style';

    try {
      setIsGenerating(true);

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

      const response = await videoGenerationService.generateScene({
        video_id: videoId,
        scene_id: sceneId,
        prompt: finalPrompt,
        model: selectedModel,
        quality: selectedQuality,
        duration_seconds: selectedFrameRange?.duration || 5.0,
        reference_frame: referenceFrame,
        style_settings: {},
        user_api_key: userApiKey || undefined
      });

      console.log('Generation started:', response);

      await videoGenerationService.pollGenerationStatus(
        response.job_id,
        (status) => {
          setGenerationStatus(status);
          console.log('Generation progress:', status);
        }
      );

      const frameData = {
        videoName,
        startFrame: selectedFrameRange?.start || 0,
        endFrame: selectedFrameRange?.end || 0,
        duration: selectedFrameRange?.duration || 0,
        totalFrames: selectedFrameRange ? selectedFrameRange.end - selectedFrameRange.start : 0,
        jobId: response.job_id,
        generationUrl: generationStatus?.generation_url,
        downloadUrl: generationStatus?.download_url,
        streamUrl: generationStatus?.stream_url
      };

      onGenerate(selectedModel, frameData);

      if (generationStatus?.status === 'completed') {
        const shouldDownload = confirm('Video generation completed! Would you like to download it now?');
        if (shouldDownload && generationStatus.download_url) {
          window.open(generationStatus.download_url, '_blank');
        }
      }

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
        className="w-[520px] sm:max-w-2xl min-h-[580px] max-h-[95vh] overflow-y-auto backdrop-blur-md border border-border/50 shadow-2xl"
      >
        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg border border-border">
            <h3 className="text-sm font-medium text-foreground mb-2">Source Video</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium">Video:</span> {videoName}</p>
              {selectedFrameRange && (
                <>
                  <p><span className="font-medium">Frame Range:</span> {selectedFrameRange.start} - {selectedFrameRange.end}</p>
                  <p><span className="font-medium">Duration:</span> {selectedFrameRange.duration.toFixed(1)}s</p>
                </>
              )}
            </div>
          </div>

          {creditsRemaining !== null && (
            <CreditWarning
              creditsRemaining={creditsRemaining}
              estimatedCost={selectedModel !== 'remove' ? estimatedCost : 0}
              operation="Video Generation"
            />
          )}

          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('references')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'references'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              References & Environment
            </button>
            <button
              onClick={() => setActiveTab('output')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'output'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Quality & Output
            </button>
          </div>

          <div className="min-h-[320px] max-h-[420px] overflow-y-auto">
            {activeTab === 'references' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Reference Gallery</h3>
                    <button className="text-xs text-primary hover:text-primary/80 font-medium">
                      Browse All
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-base"></span>
                      <span className="font-medium">Environment Locks</span>
                      <span className="bg-muted px-2 py-0.5 rounded">0</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-base"></span>
                      <span className="font-medium">Object References</span>
                      <span className="bg-muted px-2 py-0.5 rounded">0</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-base"></span>
                      <span className="font-medium">Lip-sync References</span>
                      <span className="bg-muted px-2 py-0.5 rounded">0</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center opacity-50">
                        <span className="text-xs text-muted-foreground">Empty</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'output' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Quality</label>
                  <div className="px-2">
                    <select
                      value={selectedQuality}
                      onChange={(e) => setSelectedQuality(e.target.value)}
                      className="w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary outline-none appearance-none"
                    >
                      <option value="draft">Draft (480p, Fast, $0.01)</option>
                      <option value="standard">Standard (720p, Balanced, $0.05)</option>
                      <option value="high">High (1080p, Best Quality, $0.15)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Output Format</label>
                  <div className="px-2">
                    <select className="w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary outline-none appearance-none">
                      <option value="mp4">MP4 (H.264)</option>
                      <option value="webm">WebM (VP9)</option>
                      <option value="mov">MOV (ProRes)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Model Selection</label>
                  <div className="px-2">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary outline-none appearance-none"
                    >
                      {supportedModels.map((model) => (
                        <option key={model} value={model}>
                          {model === 'wan2.2' ? 'Wan 2.2 (Default)' : model}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                    Advanced AI model for realistic video generation with consistent style preservation
                  </div>
                </div>

                {showApiKeyInput && (
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">API Key (Optional)</label>
                    <input
                      type="password"
                      value={userApiKey}
                      onChange={(e) => setUserApiKey(e.target.value)}
                      placeholder="Enter your Wan API key for custom generation parameters"
                      className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                )}

                <button
                  onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                  className="text-xs text-primary hover:text-primary/80 font-medium"
                >
                  {showApiKeyInput ? 'Hide API Key Settings' : 'Advanced Settings'}
                </button>
              </div>
            )}
          </div>

          {generationStatus && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-blue-900">Generation in Progress</span>
              </div>
              <div className="text-xs text-blue-700 space-y-1">
                <p>Status: {generationStatus.status}</p>
                {generationStatus.progress !== undefined && (
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${generationStatus.progress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-50"
              disabled={isGenerating}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <AiGenerate2Line className="w-4 h-4" forceWhite={true} />
              {isGenerating ? 'Generating...' : 'Generate Video'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoGenerationDialog;
