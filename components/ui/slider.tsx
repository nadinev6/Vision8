import React, { useRef, useCallback } from 'react';
import { cn } from '../../lib/utils';

interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  children?: React.ReactNode
}

// FIX: Changed Slider from a const of type React.FC to a function declaration.
// This allows attaching properties (Track, Range, Thumb) to it for the compound component pattern.
function Slider({ value, onValueChange, min = 0, max = 100, step = 1, className, children }: SliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const percent = ((value[0] - min) / (max - min)) * 100;

  // FIX: Added native MouseEvent to the type union to handle events from window.addEventListener.
  const handleInteraction = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent) => {
      if (!sliderRef.current) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const newPercent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      let newValue = min + (newPercent / 100) * (max - min);
      newValue = Math.round(newValue / step) * step;
      onValueChange([newValue]);
  }, [min, max, step, onValueChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleInteraction(e);
    const handleMouseMove = (moveEvent: MouseEvent) => handleInteraction(moveEvent);
    const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [handleInteraction]);
  
  // Custom children mapping for Track, Range, Thumb
  // FIX: Cast track to React.ReactElement<any> to allow adding props via cloneElement.
  const track = React.Children.toArray(children).find((child: any) => child.type?.displayName === 'Slider.Track');
  const customTrack = track ? React.cloneElement(track as React.ReactElement<any>, { percent }) : null;

  return (
    <div
      ref={sliderRef}
      onMouseDown={handleMouseDown}
      className={cn("relative flex w-full touch-none select-none items-center cursor-pointer", className)}
    >
      {customTrack || (
        <div className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-200">
            <div className="absolute h-full bg-gray-900" style={{ width: `${percent}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-gray-900 bg-white ring-offset-white transition-colors" style={{ left: `${percent}%`, transform: `translate(-${percent}%, -50%)` }} />
        </div>
      )}
    </div>
  );
};

const Track: React.FC<{className?: string; children?: React.ReactNode; percent?: number;}> = ({ className, children, percent }) => {
    const range = React.Children.toArray(children).find((child: any) => child.type?.displayName === 'Slider.Range');
    const thumb = React.Children.toArray(children).find((child: any) => child.type?.displayName === 'Slider.Thumb');
    
    // FIX: Cast range and thumb to React.ReactElement<any> to allow adding props via cloneElement.
    const customRange = range ? React.cloneElement(range as React.ReactElement<any>, { style: { width: `${percent}%` }}) : null;
    const customThumb = thumb ? React.cloneElement(thumb as React.ReactElement<any>, { style: { left: `${percent}%`, transform: `translate(-${percent}%, -50%)` }}) : null;
    
    return (
        <div className={cn("relative h-1 w-full grow overflow-hidden rounded-full", className)}>
            {customRange}
            {customThumb}
        </div>
    )
}
Track.displayName = 'Slider.Track';

const Range: React.FC<{className?: string, style?: React.CSSProperties}> = ({ className, style }) => <div className={cn("absolute h-full", className)} style={style} />
Range.displayName = 'Slider.Range';

const Thumb: React.FC<{className?: string, style?: React.CSSProperties}> = ({ className, style }) => <div className={cn("absolute top-1/2 block h-3 w-3 rounded-full border-2 border-primary bg-background ring-offset-background", className)} style={style} />
Thumb.displayName = 'Slider.Thumb';

Slider.Track = Track;
Slider.Range = Range;
Slider.Thumb = Thumb;

export { Slider };