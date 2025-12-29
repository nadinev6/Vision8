import React, { useState, useEffect } from 'react';

/**
 * Hook to fetch current credit balance from backend
 * Polls periodically and updates component state
 */
export function useCreditsRemaining(pollInterval: number = 30000) {
    const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchCredits = React.useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/v1/mcp/tools', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            if (!response.ok) {
                console.warn(`Credits API returned ${response.status}. MCP might be uninitialized.`);
                return;
            }

            // Find checkCredits tool result in tools list if available
            // Otherwise, make a dedicated checkCredits call
            const creditsResp = await fetch('/api/v1/mcp/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    tool_name: 'checkCredits',
                    parameters: {}
                })
            });

            if (creditsResp.ok) {
                const data = await creditsResp.json();
                setCreditsRemaining(data.credits_remaining ?? data.creditsRemaining);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(message);
            console.error('Failed to fetch credits:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCredits();
        const interval = setInterval(fetchCredits, pollInterval);
        return () => clearInterval(interval);
    }, [fetchCredits, pollInterval]);

    return { creditsRemaining, isLoading, error, refetch: fetchCredits };
}

/**
 * Estimate ComfyUI Cloud credits for a generation operation
 * Based on resolution and quality tier
 */
export function estimateGenerationCost(
    quality: 'draft' | 'standard' | 'high' | 'ultra' = 'standard'
): number {
    const costMap: Record<string, number> = {
        draft: 10,    // 480p, 20 steps, proxy
        standard: 20, // 720p, 30 steps
        high: 50,     // 1080p, 35 steps
        ultra: 100,   // 4K, 40 steps
    };
    return costMap[quality] ?? 20;
}
