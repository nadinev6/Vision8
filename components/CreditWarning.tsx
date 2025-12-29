import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

interface CreditWarningProps {
  creditsRemaining: number;
  estimatedCost?: number;
  operation?: string;
  onDismiss?: () => void;
  className?: string;
}

const CREDIT_WARNING_THRESHOLD = 100; // Warn when below 100 credits
const CREDIT_CRITICAL_THRESHOLD = 50; // Critical alert when below 50

/**
 * CreditWarning Component
 * 
 * Displays ComfyUI Cloud credit balance and warnings before expensive operations.
 * - Yellow warning when credits < 100
 * - Red critical alert when credits < 50
 * - Shows estimated cost of current operation if provided
 * 
 * Credit costs (ComfyUI Cloud):
 * - Proxy generation (480p, 20 steps): ~10 credits
 * - Standard generation (720p, 30 steps): ~20 credits
 * - High quality (1080p, 35 steps): ~50 credits
 * - Ultra (4K, 40 steps): ~100 credits
 */
export const CreditWarning: React.FC<CreditWarningProps> = ({
  creditsRemaining,
  estimatedCost = 0,
  operation = 'Video Generation',
  onDismiss,
  className
}) => {
  const isCritical = creditsRemaining < CREDIT_CRITICAL_THRESHOLD;
  const isWarning = creditsRemaining < CREDIT_WARNING_THRESHOLD;
  const sufficientCredits = creditsRemaining >= estimatedCost;

  // Don't show warning if credits haven't loaded, or if they are healthy
  if (creditsRemaining === null || !isWarning) {
    return null;
  }

  return (
    <div
      className={cn(
        'p-3 rounded-md border flex items-start gap-3 transition-all duration-200',
        isCritical
          ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-100'
          : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-100',
        className
      )}
    >
      <div className="flex-shrink-0 text-lg mt-0.5">
        {isCritical ? '⚠️' : '⚡'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">
          {isCritical ? 'Critical: Low Credits' : 'Low Credit Balance'}
        </p>
        <p className="text-sm mt-1">
          You have <span className="font-mono font-bold">{creditsRemaining}</span> credits remaining.
          {estimatedCost > 0 && !sufficientCredits && (
            <>
              {' '}
              <span className="font-mono">{operation}</span> requires ~
              <span className="font-mono font-bold">{estimatedCost}</span> credits.
            </>
          )}
        </p>
        {isCritical && (
          <p className="text-sm mt-2 opacity-90">
            ⚠️ You may not have enough credits for most operations. Consider upgrading your ComfyUI Cloud plan.
          </p>
        )}
        {!sufficientCredits && (
          <p className="text-sm mt-2 opacity-90 font-semibold">
            ❌ Insufficient credits for this operation. Please add more credits or choose a lower quality preset.
          </p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-xs opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Dismiss credit warning"
        >
          ✕
        </button>
      )}
    </div>
  );
};


import { useCreditsRemaining, estimateGenerationCost } from '../lib/credits';

export { useCreditsRemaining, estimateGenerationCost };
