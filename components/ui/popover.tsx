import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface PopoverContextProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const PopoverContext = createContext<PopoverContextProps | null>(null);

const usePopover = () => {
  const context = useContext(PopoverContext);
  if (!context) {
    throw new Error("usePopover must be used within a Popover");
  }
  return context;
};

const Popover: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <PopoverContext.Provider value={{ isOpen, setIsOpen }}>
      <span className="relative inline-block align-baseline">{children}</span>
    </PopoverContext.Provider>
  );
};

const PopoverTrigger: React.FC<{ children: React.ReactNode, asChild?: boolean }> = ({ children, asChild }) => {
  const { isOpen, setIsOpen } = usePopover();
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };
  
  if (asChild) {
      // FIX: Cast children to React.ReactElement<any> to allow adding props via cloneElement.
      // This is necessary because TypeScript cannot guarantee that the arbitrary child component accepts an `onClick` prop.
      return React.cloneElement(children as React.ReactElement<any>, {
          onClick: handleClick,
      });
  }
  return <button onClick={handleClick}>{children}</button>;
};


const PopoverContent: React.FC<{ children: React.ReactNode; className?: string; }> = ({ children, className }) => {
  const { isOpen, setIsOpen } = usePopover();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; showBelow: boolean } | null>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
            setIsOpen(false);
        }
    };
    if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    if (isOpen && popoverRef.current) {
      // Find the trigger button
      const trigger = popoverRef.current.parentElement?.querySelector('button');
      if (trigger) {
        const triggerRect = trigger.getBoundingClientRect();
        const popoverWidth = 400; // Max width of popover
        const popoverHeight = 200; // Estimated height
        const spaceAbove = triggerRect.top;
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const margin = 16; // Minimum margin from edges
        
        // Determine if we should show below or above
        const showBelow = spaceAbove < popoverHeight && spaceBelow > spaceAbove;
        
        // Calculate horizontal position with boundary checking
        let left = triggerRect.left + triggerRect.width / 2;
        const halfPopoverWidth = popoverWidth / 2;
        
        // Check if popover would go off the left edge
        if (left - halfPopoverWidth < margin) {
          left = halfPopoverWidth + margin;
        }
        
        // Check if popover would go off the right edge
        if (left + halfPopoverWidth > window.innerWidth - margin) {
          left = window.innerWidth - halfPopoverWidth - margin;
        }
        
        const top = showBelow 
          ? triggerRect.bottom + 8 
          : triggerRect.top - 8;
        
        setPosition({ top, left, showBelow });
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Check if this is a volume slider (simple popover)
  const isVolumeSlider = className?.includes('w-32') || className?.includes('bg-black/50');
  
  if (isVolumeSlider) {
    // Use simple absolute positioning for volume slider - always above for video controls
    return (
      <div
          ref={popoverRef}
          className={cn(
              "absolute z-50 bottom-full mb-2 min-w-[8rem] rounded-md border bg-white p-2 text-gray-800 shadow-md",
              className
          )}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            zIndex: 50
          }}
      >
          {children}
      </div>
    );
  }

  // Use fixed positioning for citation popovers to avoid clipping
  return (
    <div
        ref={popoverRef}
        className={cn(
            "fixed z-[9999] min-w-[8rem] rounded-md border bg-card p-4 text-card-foreground shadow-xl backdrop-blur-sm",
            className
        )}
        style={{
          position: 'fixed',
          top: position?.showBelow ? `${position.top}px` : 'auto',
          bottom: position?.showBelow ? 'auto' : `${window.innerHeight - (position?.top || 0)}px`,
          left: `${position?.left || 0}px`,
          transform: 'translateX(-50%)',
          zIndex: 9999,
          maxWidth: '400px'
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
    >
        {children}
    </div>
  );
};

export { Popover, PopoverTrigger, PopoverContent };