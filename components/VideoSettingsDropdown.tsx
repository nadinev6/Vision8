import React, { useState, useRef, useEffect } from 'react';
import { SettingsIcon } from './icons';

interface VideoSettingsDropdownProps {
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  videoEl: HTMLVideoElement | null;
  onSyncChange?: () => void;
  activeSyncMode?: 'video' | 'none';
}

const VideoSettingsDropdown: React.FC<VideoSettingsDropdownProps> = ({
  playbackSpeed,
  setPlaybackSpeed,
  videoEl,
  onSyncChange,
  activeSyncMode
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSpeedSubmenu, setShowSpeedSubmenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<'right' | 'left'>('right');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowSpeedSubmenu(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const menuWidth = 280;
      const spaceOnRight = window.innerWidth - rect.right;
      
      if (spaceOnRight < menuWidth) {
        setMenuPosition('left');
      } else {
        setMenuPosition('right');
      }
    }
  }, [isOpen]);

  const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  const SpeedIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </svg>
  );

  const SyncIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
      <path d="M3 21v-5h5"/>
    </svg>
  );

  const ChevronIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9,18 15,12 9,6"/>
    </svg>
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={dropdownRef}>
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <SettingsIcon className="w-5 h-5" />
      </button>
      
      {/* Main Menu */}
      {isOpen && !showSpeedSubmenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            ...(menuPosition === 'right' ? { right: '0' } : { left: '0' }),
            marginBottom: '8px',
            width: '280px',
            backgroundColor: 'rgba(60, 60, 60, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            padding: '8px',
            zIndex: 10000,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: 'white'
          }}
        >
          {/* Playback Speed Row */}
          <div
            onClick={() => setShowSpeedSubmenu(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <SpeedIcon />
            <span style={{ 
              marginLeft: '16px', 
              fontSize: '15px', 
              fontWeight: '400',
              flex: 1
            }}>
              Playback speed
            </span>
            <span style={{ 
              fontSize: '14px', 
              color: 'rgba(255, 255, 255, 0.7)',
              marginRight: '8px'
            }}>
              {playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}
            </span>
            <ChevronIcon />
          </div>

          {/* Video Sync Row */}
          {onSyncChange && (
            <div
              onClick={() => {
                onSyncChange();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <SyncIcon />
              <span style={{ 
                marginLeft: '16px', 
                fontSize: '15px', 
                fontWeight: '400',
                flex: 1
              }}>
                Video sync
              </span>
              <div style={{
                width: '44px',
                height: '24px',
                backgroundColor: activeSyncMode === 'video' ? '#4caf50' : 'rgba(255, 255, 255, 0.3)',
                borderRadius: '12px',
                position: 'relative',
                transition: 'background-color 0.2s ease',
                marginRight: '8px'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: activeSyncMode === 'video' ? '22px' : '2px',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Speed Submenu */}
      {isOpen && showSpeedSubmenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            ...(menuPosition === 'right' ? { right: '0' } : { left: '0' }),
            marginBottom: '8px',
            width: '280px',
            backgroundColor: 'rgba(60, 60, 60, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            padding: '8px',
            zIndex: 10000,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: 'white'
          }}
        >
          {/* Back Button */}
          <div
            onClick={() => setShowSpeedSubmenu(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              marginBottom: '4px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'rotate(180deg)' }}>
              <polyline points="9,18 15,12 9,6"/>
            </svg>
            <span style={{ marginLeft: '12px', fontSize: '15px', fontWeight: '400' }}>
              Playback speed
            </span>
          </div>

          {/* Speed Options */}
          {speedOptions.map((speed) => (
            <div
              key={speed}
              onClick={() => {
                if (videoEl) videoEl.playbackRate = speed;
                setPlaybackSpeed(speed);
                setShowSpeedSubmenu(false);
                setIsOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                backgroundColor: playbackSpeed === speed ? 'rgba(255, 255, 255, 0.15)' : 'transparent'
              }}
              onMouseEnter={(e) => {
                if (playbackSpeed !== speed) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (playbackSpeed !== speed) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span style={{ 
                fontSize: '15px', 
                fontWeight: playbackSpeed === speed ? '500' : '400',
                flex: 1
              }}>
                {speed === 1 ? 'Normal' : `${speed}x`}
              </span>
              {playbackSpeed === speed && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoSettingsDropdown;