import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { XIcon } from '../icons';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog content */}
      <div className="relative z-10 animate-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  );
};

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClose?: () => void;
}

export const DialogContent: React.FC<DialogContentProps> = ({ children, className, title, onClose }) => {
  return (
    <div 
      className={cn(
        "rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto",
        "w-full max-w-2xl mx-4",
        className
      )}
      style={{
        background: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
      }}
    >
      {title && (
        <div 
          className="flex items-center justify-between px-6 py-4"
          style={{
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)'
          }}
        >
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            >
              <XIcon className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}
      <div className="px-6 py-5">
        {children}
      </div>
    </div>
  );
};
