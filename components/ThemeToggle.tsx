import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';

const ThemeToggle: React.FC = () => {
    const { theme, setTheme } = useTheme();

    return (
        <div className="flex items-center bg-muted/50 p-1 rounded-full border border-border">
            <button
                onClick={() => setTheme('light')}
                className={cn(
                    "p-1.5 rounded-full transition-all flex items-center justify-center",
                    theme === 'light' ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/20"
                )}
                title="Light Mode (Crimson)"
            >
                <div className="w-4 h-4 rounded-full border border-[#d01c1c] flex items-center justify-center bg-[#d01c1c22]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d01c1c]"></div>
                </div>
            </button>
            <button
                onClick={() => setTheme('dark')}
                className={cn(
                    "p-1.5 rounded-full transition-all flex items-center justify-center",
                    theme === 'dark' ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/20"
                )}
                title="Dark Mode (Crimson)"
            >
                <div className="w-4 h-4 rounded-full border border-[#d01c1c] flex items-center justify-center bg-[#0a0a0a]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d01c1c]"></div>
                </div>
            </button>
        </div>
    );
};

export default ThemeToggle;
