import React from 'react';
import { cn } from '../lib/utils';

interface CardProps {
    className?: string;
    children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ className, children }) => {
  return (
    <div className={cn("bg-card border border-border rounded-lg shadow-sm", className)}>
      {children}
    </div>
  );
};

export { Card };