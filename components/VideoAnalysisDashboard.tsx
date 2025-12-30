import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Progress } from './ui/progress';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Download, 
  Share2, 
  Eye, 
  EyeOff,
  Scissors,
  Target,
  Clock,
  Users,
  Sparkles,
  Bot,
  Zap,
  Shield,
  Cpu,
  Wifi
} from 'lucide-react';

interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // x, y, width, height
  timestamp: number;
  sceneNumber: number;
  color: string;
}

interface SceneData {
  id: string;
  startTime: number;
  endTime: number;
  sceneNumber: number;
  summary: string;
  detectedObjects: DetectedObject[];
  complexity: 'low' | 'medium' | 'high';
}

interface VideoAnalysisData {
  videoId: string;
  title: string;
  duration: number;
  status: 'analyzing' | 'completed' | 'failed';
  progress: number;
  currentTimestamp: number;
  scenes: SceneData[];
  totalObjects: number;
  totalScenes: number;
  hasAudio: boolean;
  audioDuration: number;
  transcriptAvailable: boolean;
  processingMode: 'client' | 'server' | 'hybrid';
  detectedObjects: DetectedObject[];
  processingInfo: {
    modelUsed: string;
    processingTime: number;
    frameCount: number;
    fps: number;
    gpuAcceleration: boolean;
    realTimeProcessing: boolean;
  };
}

interface VideoAnalysisDashboardProps {
  videoAnalysisData: VideoAnalysisData;
  onTimeSeek: (time: number) => void;
  onObjectAction: (action: string, objectData: any) => void;
  onSceneSelect: (sceneIndex: number) => void;
  onPlayPause: () => void;
  isPlaying: boolean;
  currentTime: number;
}

export const VideoAnalysisDashboard: React.FC<VideoAnalysisDashboardProps> = ({
  videoAnalysisData,
  onTimeSeek,
  onObjectAction,
  onSceneSelect,
  onPlayPause,
  isPlaying,
  currentTime,
}) => {
  const [activeTab, setActiveTab] = useState('scenes');
  const [selectedScene, setSelectedScene] = useState<SceneData | null>(null);
  const [showObjectOverlays, setShowObjectOverlays] = useState(true);
  const [objectFilter, setObjectFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate current scene based on timestamp
  const currentScene = videoAnalysisData.scenes.find(
    scene => currentTime >= scene.startTime && currentTime <= scene.endTime
  );

  // Filter objects based on search and filter
  const filteredObjects = videoAnalysisData.detectedObjects.filter(obj => {
    const matchesSearch = obj.label.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = objectFilter === 'all' || obj.sceneNumber.toString() === objectFilter;
    return matchesSearch && matchesFilter;
  });

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getProcessingModeIcon = () => {
    switch (videoAnalysisData.processingMode) {
      case 'client':
        return <Cpu className="h-4 w-4" />;
      case 'server':
        return <Wifi className="h-4 w-4" />;
      case 'hybrid':
        return <Zap className="h-4 w-4" />;
      default:
        return <Cpu className="h-4 w-4" />;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Video Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {videoAnalysisData.title}
                <Badge variant="outline" className="flex items-center gap-1">
                  {getProcessingModeIcon()}
                  {videoAnalysisData.processingMode}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-2">
                {videoAnalysisData.totalScenes} scenes • {videoAnalysisData.totalObjects} objects detected • 
                {formatTime(videoAnalysisData.duration)} duration
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowObjectOverlays(!showObjectOverlays)}
              >
                {showObjectOverlays ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {showObjectOverlays ? 'Hide' : 'Show'} Objects
              </Button>
              <Button variant="outline" size="sm">
                <Share2 className="h-4 w-4" />
                Share Analysis
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Analysis Progress</span>
              <span>{videoAnalysisData.progress}%</span>
            </div>
            <Progress value={videoAnalysisData.progress} className="w-full" />
          </div>

          {/* Current Time Display */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <Button onClick={onPlayPause} size="sm" variant="outline">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <span className="text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(videoAnalysisData.duration)}
              </span>
            </div>
            {currentScene && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Scene {currentScene.sceneNumber}: {currentScene.summary}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Processing Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Processing Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {videoAnalysisData.processingInfo.modelUsed}
              </div>
              <div className="text-sm text-gray-500">AI Model</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {videoAnalysisData.processingInfo.processingTime}s
              </div>
              <div className="text-sm text-gray-500">Processing Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {videoAnalysisData.processingInfo.fps}fps
              </div>
              <div className="text-sm text-gray-500">Frame Rate</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                {videoAnalysisData.processingInfo.gpuAcceleration && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    GPU Accelerated
                  </Badge>
                )}
                {videoAnalysisData.processingInfo.realTimeProcessing && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Real-time
                  </Badge>
                )}
              </div>
              <div className="text-sm text-gray-500 mt-1">Performance</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="scenes">Scenes ({videoAnalysisData.totalScenes})</TabsTrigger>
          <TabsTrigger value="objects">Objects ({videoAnalysisData.totalObjects})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="chat">AI Chat</TabsTrigger>
        </TabsList>

        {/* Scenes Tab */}
        <TabsContent value="scenes" className="space-y-4">
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Search scenes..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="grid gap-4">
            {videoAnalysisData.scenes.map((scene) => (
              <Card 
                key={scene.id} 
                className={`cursor-pointer transition-colors ${
                  selectedScene?.id === scene.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => {
                  setSelectedScene(scene);
                  onSceneSelect(scene.sceneNumber);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Scene {scene.sceneNumber}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge className={getComplexityColor(scene.complexity)}>
                        {scene.complexity}
                      </Badge>
                      <Badge variant="outline">
                        {formatTime(scene.startTime)} - {formatTime(scene.endTime)}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>{scene.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">
                        {scene.detectedObjects.length} objects detected
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTimeSeek(scene.startTime);
                      }}
                    >
                      Jump to Scene
                    </Button>
                  </div>
                  
                  {/* Object Preview */}
                  {scene.detectedObjects.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {scene.detectedObjects.slice(0, 5).map((obj) => (
                        <Badge key={obj.id} variant="secondary" className="text-xs">
                          {obj.label}
                        </Badge>
                      ))}
                      {scene.detectedObjects.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{scene.detectedObjects.length - 5} more
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Objects Tab */}
        <TabsContent value="objects" className="space-y-4">
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Search objects..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="px-3 py-2 border border-gray-300 rounded-md"
              value={objectFilter}
              onChange={(e) => setObjectFilter(e.target.value)}
            >
              <option value="all">All Scenes</option>
              {videoAnalysisData.scenes.map((scene) => (
                <option key={scene.id} value={scene.sceneNumber.toString()}>
                  Scene {scene.sceneNumber}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3">
            {filteredObjects.map((object) => (
              <Card key={object.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: object.color }}
                    />
                    <div>
                      <div className="font-medium">{object.label}</div>
                      <div className="text-sm text-gray-500">
                        Scene {object.sceneNumber} • {formatTime(object.timestamp)} • 
                        {Math.round(object.confidence * 100)}% confidence
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onTimeSeek(object.timestamp)}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onObjectAction('remove', object)}
                    >
                      <Scissors className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onObjectAction('highlight', object)}
                    >
                      <Target className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Video Timeline</CardTitle>
              <CardDescription>
                Interactive timeline with scenes and object markers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Timeline Bar */}
                <div className="relative h-12 bg-gray-100 rounded-lg overflow-hidden">
                  <div 
                    className="absolute h-full bg-blue-500 opacity-30"
                    style={{
                      left: `${(currentTime / videoAnalysisData.duration) * 100}%`,
                      width: '2px'
                    }}
                  />
                  
                  {/* Scene Markers */}
                  {videoAnalysisData.scenes.map((scene) => (
                    <div
                      key={scene.id}
                      className="absolute top-0 h-full border-l border-gray-400 cursor-pointer hover:bg-blue-200"
                      style={{
                        left: `${(scene.startTime / videoAnalysisData.duration) * 100}%`,
                        width: `${((scene.endTime - scene.startTime) / videoAnalysisData.duration) * 100}%`
                      }}
                      onClick={() => onTimeSeek(scene.startTime)}
                      title={`Scene ${scene.sceneNumber}: ${scene.summary}`}
                    />
                  ))}
                </div>

                {/* Object Markers */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Detected Objects</h4>
                  <div className="relative h-8 bg-gray-50 rounded">
                    {videoAnalysisData.detectedObjects.map((object) => (
                      <div
                        key={object.id}
                        className="absolute w-2 h-2 rounded-full cursor-pointer hover:scale-150 transition-transform"
                        style={{
                          backgroundColor: object.color,
                          left: `${(object.timestamp / videoAnalysisData.duration) * 100}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                        onClick={() => onTimeSeek(object.timestamp)}
                        title={`${object.label} at ${formatTime(object.timestamp)}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Chat Tab */}
        <TabsContent value="chat">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Video Analysis Chat
              </CardTitle>
              <CardDescription>
                Ask questions about your video, get scene summaries, or request object modifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button variant="outline" size="sm" className="text-xs">
                    What's happening in this scene?
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    Show me all objects
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    Remove background objects
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs">
                    Create highlights reel
                  </Button>
                </div>

                {/* Chat Messages */}
                <div className="border rounded-lg p-4 h-64 overflow-y-auto bg-gray-50">
                  <div className="text-center text-gray-500 mt-20">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>AI Chat Ready</p>
                    <p className="text-sm">Ask questions about your video analysis</p>
                  </div>
                </div>

                {/* Chat Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ask about your video..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <Button>
                    <Sparkles className="h-4 w-4" />
                    Ask AI
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};