
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import MuxPlayer from '@mux/mux-player-react';

interface MuxVideoPlayerProps {
    playbackId: string | null;
    src?: string | null; // Keep src for compatibility/fallback, though playbackId is preferred for Mux
    title?: string;
    className?: string;
    onTimeUpdate?: (time: number) => void;
    onEnded?: () => void;
    onLoadedMetadata?: () => void;
    onDurationChange?: (duration: number) => void;
    onSeeked?: () => void;
    muted?: boolean;
    autoPlay?: boolean;
    loop?: boolean;
    onClick?: () => void;
    startTime?: number;
}

const MuxVideoPlayer = forwardRef<HTMLVideoElement, MuxVideoPlayerProps>((props, ref) => {
    const muxPlayerRef = useRef<any>(null); // Type 'any' because MuxPlayer ref definition can be tricky

    // Expose the underlying video element to the parent using the ref
    useImperativeHandle(ref, () => {
        // MuxPlayer exposes the underlying video element via .media.nativeEl
        return muxPlayerRef.current?.media?.nativeEl;
    }, []);

    useEffect(() => {
        const player = muxPlayerRef.current;
        if (player && props.startTime && props.startTime > 0) {
            player.currentTime = props.startTime;
        }
    }, [props.startTime, props.playbackId]);

    // If no source/playbackId, render a placeholder
    if (!props.playbackId && !props.src) {
        return (
            <div className={`flex items-center justify-center w-full h-full bg-black/80 rounded-lg text-white ${props.className}`}>
                <p className="text-muted-foreground font-medium">{props.title || "No Video"}</p>
            </div>
        );
    }

    return (
        <MuxPlayer
            ref={muxPlayerRef}
            playbackId={props.playbackId || undefined}
            src={props.src || undefined}
            metadata={{
                video_title: props.title,
            }}
            className={props.className}
            onTimeUpdate={(e: any) => props.onTimeUpdate?.(e.target.currentTime)}
            onEnded={props.onEnded}
            onLoadedMetadata={() => {
                props.onLoadedMetadata?.();
                if (muxPlayerRef.current?.duration) {
                    props.onDurationChange?.(muxPlayerRef.current.duration);
                }
            }}
            onSeeked={props.onSeeked}
            muted={props.muted}
            autoPlay={props.autoPlay}
            loop={props.loop}
            onClick={props.onClick}
            streamType="on-demand"
            // Hide default controls if we want to use custom ones entirely, 
            // but Mux Player controls are usually quite good. 
            // For now, let's keep them enabled or minimal as per request?
            // "Replace current HTML5 video players with Mux Player while preserving custom overlay features"
            // We likely want to hide default controls if we are overlaying our own.
            // But Mux Player Pro defaults are nice. Let's start with minimal controls to allow our overlays.
            controls={false}
            style={{
                height: '100%',
                width: '100%',
                '--media-object-fit': 'contain',
                '--media-object-position': 'center',
            } as React.CSSProperties}
        />
    );
});

MuxVideoPlayer.displayName = 'MuxVideoPlayer';

export default MuxVideoPlayer;
