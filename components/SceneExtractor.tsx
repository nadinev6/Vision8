import React, { useState, useEffect } from 'react';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { formatTime } from '../lib/utils';

// Initialize FFmpeg
const ffmpeg = new FFmpeg();

interface SceneExtractorProps {
  videoUrl: string;
  videoDuration: number; // in seconds
  onSceneExtracted: (clipUrl: string, startTime: number, endTime: number) => void;
}

export const SceneExtractor: React.FC<SceneExtractorProps> = ({
  videoUrl,
  videoDuration,
  onSceneExtracted
}) => {
  const [isReady, setIsReady] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, videoDuration]);
  const [error, setError] = useState<string | null>(null);

  // Initialize FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        if (!ffmpeg.loaded) {
          await ffmpeg.load({
            coreURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js', 'text/javascript'),
          });
        }
        setIsReady(true);
      } catch (err) {
        setError('Failed to load FFmpeg. Please check your browser compatibility.');
        console.error('FFmpeg load error:', err);
      }
    };

    loadFFmpeg();
  }, []);

  // Handle time range selection
  const handleRangeChange = (values: number[]) => {
    setTimeRange([values[0], values[1]]);
  };

  // Extract the scene
  const extractScene = async () => {
    try {
      setIsExtracting(true);
      setError(null);
      setProgress(0);

      // Download the video file
      const videoData = await fetchFile(videoUrl);
      const inputFileName = 'input.mp4';
      const outputFileName = 'output.mp4';

      // Write the file to FFmpeg's virtual filesystem
      await ffmpeg.writeFile(inputFileName, videoData);

      // Setup progress tracking
      ffmpeg.on('progress', ({ progress }) => {
        setProgress(progress * 100);
      });

      // Prepare FFmpeg command
      const [start, end] = timeRange;
      const duration = end - start;

      // Execute FFmpeg command
      await ffmpeg.exec([
        '-i', inputFileName,
        '-ss', start.toString(),
        '-t', duration.toString(),
        '-c:v', 'libx264', // Use H.264 codec
        '-c:a', 'aac', // Use AAC for audio
        '-preset', 'ultrafast', // Faster encoding
        '-crf', '23', // Balance between quality and file size
        outputFileName
      ]);

      // Read the result
      const data = await ffmpeg.readFile(outputFileName);

      // Create a URL for the extracted clip
      const clipUrl = URL.createObjectURL(
        new Blob([data as any], { type: 'video/mp4' })
      );

      // Clean up
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);

      onSceneExtracted(clipUrl, start, end);
    } catch (err) {
      setError('Failed to extract scene. Please try again.');
      console.error('Scene extraction error:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  if (!isReady) {
    return <div>Loading FFmpeg...</div>;
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Extract Scene</h3>
        <p className="text-sm text-muted-foreground">
          Select the time range to extract:
        </p>
      </div>

      <div className="space-y-6">
        <Slider
          min={0}
          max={videoDuration}
          step={0.1}
          value={[timeRange[0], timeRange[1]]}
          onValueChange={handleRangeChange}
        />

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{formatTime(timeRange[0])}</span>
          <span>Duration: {formatTime(timeRange[1] - timeRange[0])}</span>
          <span>{formatTime(timeRange[1])}</span>
        </div>

        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}

        <Button
          onClick={extractScene}
          disabled={isExtracting || timeRange[0] === timeRange[1]}
          className="w-full"
        >
          {isExtracting ? (
            <>
              <span className="mr-2">Extracting...</span>
              <progress value={progress} max={100} />
            </>
          ) : (
            'Extract Scene'
          )}
        </Button>
      </div>
    </div>
  );
};
