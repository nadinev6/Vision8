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
  const [activeTab, setActiveTab] = useState('prompt');
  const [userApiKey, setUserApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // Load supported models and quality presets on mount
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
        // Use fallback values if API fails
        setSupportedModels(['veo3', 'sora2']);
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

    // Prompt is optional - if empty, will regenerate with original context
    const finalPrompt = prompt.trim() || 'Regenerate this scene maintaining the original context and style';

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
        prompt: finalPrompt,
        model: selectedModel,
        quality: selectedQuality,
        duration_seconds: selectedFrameRange?.duration || 5.0,
        reference_frame: referenceFrame,
        style_settings: {
          include_audio: includeAudio
        },
        user_api_key: userApiKey || undefined // Pass user API key if provided
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
      if (generationStatus?.status === 'completed') {
        const shouldDownload = confirm('Video generation completed! Would you like to download it now?');
        if (shouldDownload && generationStatus.download_url) {
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
        className="w-[520px] sm:max-w-2xl min-h-[580px] max-h-[95vh] overflow-y-auto !bg-white/95 backdrop-blur-md border border-border/50 shadow-2xl"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
      >
        <div className="space-y-4">
          {/* Frame Range Info - Always visible */}
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

          {/* Tab Navigation */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('prompt')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'prompt'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Prompt
            </button>
            <button
              onClick={() => setActiveTab('model')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'model'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              AI Model
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'settings'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Quality & Audio
            </button>
          </div>

          {/* Tab Content */}
          <div className="min-h-[320px] max-h-[420px] overflow-y-auto">
            {activeTab === 'prompt' && (
              <div className="space-y-4">
                {/* Scene Context Preview */}
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
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
                    <span className="text-xs text-muted-foreground ml-2"></span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="What would you like to change? e.g., 'Replace the red car with a blue bicycle' or 'Change the lighting to golden hour' or 'Remove the person in the background'"
                    className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent resize-none min-h-[120px]"
                    rows={6}
                  />
                </div>
              </div>
            )}

            {activeTab === 'model' && (
              <div className="space-y-4">
                {/* AI Model Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">AI Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="veo3">Veo-3 Fast (Vertex AI)</option>
                    <option value="sora2">Sora-2 (Coming Soon)</option>
                  </select>
                </div>

                {/* API Key Configuration */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Vertex AI Configuration</label>
                    <button
                      type="button"
                      onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                      className="text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      {showApiKeyInput ? 'Hide' : 'Configure API Key'}
                    </button>
                  </div>

                  {showApiKeyInput && (
                    <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground">
                          Vertex AI Access Token
                          <span className="text-muted-foreground ml-1">(Optional - for production use)</span>
                        </label>
                        <input
                          type="password"
                          value={userApiKey}
                          onChange={(e) => setUserApiKey(e.target.value)}
                          placeholder="Enter your Vertex AI access token (e.g., AQ.Ab8RN6Lg...)"
                          className="w-full p-2 text-xs border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>• Get your token from Google Cloud Console → Vertex AI</p>
                          <p>• Token is used only for this session and not stored</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Integration Status - Simplified */}
                {userApiKey && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0"></div>
                      <p className="text-sm font-medium text-green-800">Ready for Production</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-4">
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
              </div>
            )}
          </div>



          {/* Generation Status */}
          {generationStatus && (
            <div className="p-4 bg-muted rounded-lg border border-border">
              <h3 className="text-sm font-medium text-foreground mb-2">Generation Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <span className={`text-sm font-medium ${generationStatus.status === 'completed' ? 'text-green-600' :
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