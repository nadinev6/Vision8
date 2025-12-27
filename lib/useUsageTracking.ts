import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export interface UserUsage {
    videos_uploaded: number;
    ai_generations: number;
    scenes_analyzed: number;
    last_reset_at: string;
}

export function useUsageTracking() {
    const { user } = useAuth();
    const [usage, setUsage] = useState<UserUsage | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch current usage
    const fetchUsage = useCallback(async () => {
        if (!user) {
            setUsage(null);
            setIsLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('user_usage')
                .select('videos_uploaded, ai_generations, scenes_analyzed, last_reset_at')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                // PGRST116 is "no rows found" - that's okay, user just hasn't used anything yet
                console.error('Error fetching usage:', error);
            }

            setUsage(data || {
                videos_uploaded: 0,
                ai_generations: 0,
                scenes_analyzed: 0,
                last_reset_at: new Date().toISOString(),
            });
        } catch (err) {
            console.error('Failed to fetch usage:', err);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    // Increment a usage counter
    const incrementUsage = useCallback(async (field: 'videos_uploaded' | 'ai_generations' | 'scenes_analyzed', amount: number = 1) => {
        if (!user) return;

        try {
            // Call the RPC function to increment usage
            const { error } = await supabase.rpc('increment_usage', {
                p_user_id: user.id,
                p_field: field,
                p_amount: amount,
            });

            if (error) {
                console.error('Error incrementing usage:', error);
                return;
            }

            // Optimistically update local state
            setUsage(prev => prev ? {
                ...prev,
                [field]: (prev[field] || 0) + amount,
            } : null);
        } catch (err) {
            console.error('Failed to increment usage:', err);
        }
    }, [user]);

    useEffect(() => {
        fetchUsage();
    }, [fetchUsage]);

    return {
        usage,
        isLoading,
        incrementUsage,
        refreshUsage: fetchUsage,
    };
}
