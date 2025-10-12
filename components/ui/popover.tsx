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
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  );
};

const PopoverTrigger: React.FC<{ children: React.ReactNode, asChild?: boolean }> = ({ children, asChild }) => {
  const { setIsOpen } = usePopover();
  if (asChild) {
      // FIX: Cast children to React.ReactElement<any> to allow adding props via cloneElement.
      // This is necessary because TypeScript cannot guarantee that the arbitrary child component accepts an `onClick` prop.
      return React.cloneElement(children as React.ReactElement<any>, {
          onClick: () => setIsOpen(o => !o),
      });
  }
  return <button onClick={() => setIsOpen(o => !o)}>{children}</button>;
};


const PopoverContent: React.FC<{ children: React.ReactNode; className?: string; }> = ({ children, className }) => {
  const { isOpen, setIsOpen } = usePopover();
  const popoverRef = useRef<HTMLDivElement>(null);
  
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

  return (
    <div
        ref={popoverRef}
        className={cn(
            "absolute z-50 bottom-full mb-2 min-w-[8rem] rounded-md border bg-white p-2 text-gray-800 shadow-md transition-all duration-200 ease-in-out",
            isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
            className
        )}
    >
        {children}
    </div>
  );
};

export { Popover, PopoverTrigger, PopoverContent };