
import React from 'react';
import { Button } from "./ui/button";

interface SceneReplacementActionsProps {
    onOptionSelected: (option: 'remove' | 'budget' | 'premium') => void;
    timestamp: string;
}

const SceneReplacementActions: React.FC<SceneReplacementActionsProps> = ({ onOptionSelected, timestamp }) => {
    return (
        <div className="flex flex-col gap-2 mt-2 p-2 bg-muted/30 rounded-md border border-border/50">
            <p className="text-xs font-medium text-muted-foreground">Scene options for {timestamp}:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-red-900/30 dark:hover:bg-red-900/10"
                    onClick={() => onOptionSelected('remove')}
                >
                    Remove
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-xs flex flex-col items-center h-auto py-1"
                    onClick={() => onOptionSelected('budget')}
                >
                    <span>Budget</span>
                    <span className="text-[10px] opacity-60">$0.025</span>
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    className="text-xs flex flex-col items-center h-auto py-1 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 border-0"
                    onClick={() => onOptionSelected('premium')}
                >
                    <span>Premium</span>
                    <span className="text-[10px] opacity-80">$0.40</span>
                </Button>
            </div>
        </div>
    );
};

export default SceneReplacementActions;
