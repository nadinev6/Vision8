import { supabase } from '../supabaseClient';

/**
 * Imports a video that was uploaded directly to Mux dashboard.
 * @param assetId The Mux asset ID (e.g., "oYDsHE1GFChYM1YXuZSyeAAcvmX01Mokctf15ewcngew")
 * @param userId The ID of the authenticated user
 * @param title Optional custom title for the video
 * @returns Object with import status and video information
 */
export const importMuxAsset = async (assetId: string, userId: string, title?: string): Promise<{
    status: string;
    video_id?: string;
    mux_asset_id: string;
    mux_playback_id?: string;
    title?: string;
}> => {
    try {
        console.log("📦 Importing Mux asset:", assetId);

        const backendUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const response = await fetch(`${backendUrl}/mux/assets/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                asset_id: assetId,
                user_id: userId,
                title: title
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || `Failed to import asset: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("✅ Asset imported successfully:", result);
        return result;

    } catch (error) {
        console.error("Mux asset import error:", error);
        throw error;
    }
};

/**
 * Uploads a video to Mux and links it to the current user in Supabase.
 * @param file The video file to upload
 * @param userId The ID of the authenticated user
 * @returns The Mux upload ID
 */
export const uploadVideoToMux = async (file: File, userId: string): Promise<string> => {
    try {
        console.log("🎬 Starting Mux upload process...");

        // 1. Get Upload URL from our backend
        // Note: Using relative path assuming Vite proxy or absolute if configured
        const backendUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const urlResponse = await fetch(`${backendUrl}/mux/upload/url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!urlResponse.ok) {
            throw new Error(`Failed to get upload URL: ${urlResponse.statusText}`);
        }

        const { upload_url, upload_id } = await urlResponse.json();
        console.log("📦 Got upload URL", { upload_id });

        // 2. Create record in Supabase linking User <-> Video
        // We do this BEFORE upload to ensure we track it even if upload fails midway
        const { error: dbError } = await supabase.from('videos').insert({
            user_id: userId,
            upload_id: upload_id,
            title: file.name,
            status: 'uploading',
            created_at: new Date().toISOString()
        });

        if (dbError) {
            console.error("Database insert failed", dbError);
            throw new Error(`Failed to create video record: ${dbError.message}`);
        }

        // 3. Upload file to Mux (Direct Upload)
        // Using simple fetch PUT for MVP. For production handled large files, use UpChunk.
        console.log("⬆️ Uploading bytes to Mux...");
        const uploadResponse = await fetch(upload_url, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });

        if (!uploadResponse.ok) {
            throw new Error(`Mux upload failed: ${uploadResponse.statusText}`);
        }

        console.log("✅ Upload completed successfully");
        return upload_id;

    } catch (error) {
        console.error("Mux upload error:", error);
        throw error;
    }
};

/**
 * Fetches all assets for the current user with engagement metrics
 * @param timeframe Timeframe for engagement metrics (e.g., "7:days")
 * @returns Array of user assets with engagement data
 */
export const getUserAssetsWithEngagement = async (timeframe: string = "7:days"): Promise<{
    status: string;
    assets: Array<{
        asset_id: string;
        title: string;
        status: string;
        duration: number;
        created_at: string | null;
        playback_id: string | null;
        engagement: {
            total_views: number;
            total_watch_time: number;
            formatted_watch_time: string;
            average_view_duration: number;
        };
    }>;
    period: string;
}> => {
    try {
        console.log("📊 Fetching user assets with engagement...");

        const backendUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const response = await fetch(`${backendUrl}/mux/user-assets?timeframe=${timeframe}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || `Failed to fetch user assets: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("✅ Fetched user assets:", result.assets.length, "assets found");
        return result;

    } catch (error) {
        console.error("Error fetching user assets:", error);
        throw error;
    }
};

/**
 * Fetches engagement metrics for a specific asset
 * @param assetId The Mux asset ID
 * @param timeframe Timeframe for engagement metrics (e.g., "7:days")
 * @returns Engagement data for the specified asset
 */
export const getAssetEngagement = async (assetId: string, timeframe: string = "7:days"): Promise<{
    status: string;
    asset_id: string;
    engagement: {
        total_views: number;
        total_watch_time: number;
        formatted_watch_time: string;
        average_view_duration: number;
    };
    period: string;
}> => {
    try {
        console.log(`📊 Fetching engagement for asset ${assetId}...`);

        const backendUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const response = await fetch(`${backendUrl}/mux/assets/${assetId}/engagement?timeframe=${timeframe}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || `Failed to fetch asset engagement: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("✅ Fetched asset engagement:", result);
        return result;

    } catch (error) {
        console.error("Error fetching asset engagement:", error);
        throw error;
    }
};

/**
 * Refreshes metadata for a specific asset (useful after upload completes)
 * @param assetId The Mux asset ID
 * @returns Updated asset metadata
 */
export const refreshAssetMetadata = async (assetId: string): Promise<{
    status: string;
    asset_id: string;
    playback_id: string;
    title: string;
    duration: number;
}> => {
    try {
        console.log(`🔄 Refreshing metadata for asset ${assetId}...`);

        const backendUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const response = await fetch(`${backendUrl}/mux/assets/${assetId}/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || `Failed to refresh asset metadata: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("✅ Refreshed asset metadata:", result);
        return result;

    } catch (error) {
        console.error("Error refreshing asset metadata:", error);
        throw error;
    }
};
/**
 * Uploads a video file to Mux and returns the asset information
 * @param file The video file to upload
 * @param userId The ID of the authenticated user
 * @returns Complete asset information including engagement data
 */
export const uploadVideoToMuxComplete = async (file: File, userId: string): Promise<{
    upload_id: string;
    asset_id: string;
    playback_id: string;
    title: string;
    duration: number;
    asset_status: string;
    engagement: {
        total_views: number;
        total_watch_time: number;
        formatted_watch_time: string;
        average_view_duration: number;
    };
}> => {
    try {
        console.log("🎬 Starting complete Mux upload process...");

        // 1. Upload the file to Mux
        const uploadId = await uploadVideoToMux(file, userId);

        // 2. Wait a moment for Mux to process the asset (in production, use webhooks)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Refresh metadata to get the asset ID and playback ID
        const refreshResponse = await refreshAssetMetadata(uploadId);

        // 4. Get engagement data for the new asset
        const engagementResponse = await getAssetEngagement(refreshResponse.asset_id);

        console.log("✅ Complete upload successful:", refreshResponse.asset_id);
        return {
            upload_id: uploadId,
            asset_id: refreshResponse.asset_id,
            playback_id: refreshResponse.playback_id,
            title: refreshResponse.title,
            duration: refreshResponse.duration,
            asset_status: refreshResponse.status,
            engagement: engagementResponse.engagement
        };

    } catch (error) {
        console.error("Complete Mux upload error:", error);
        throw error;
    }
};
/**
 * Lists recent assets from the Mux dashboard.
 * @returns Array of assets from Mux
 */
export const listRecentMuxAssets = async (): Promise<any[]> => {
    try {
        console.log("🔍 Listing recent Mux assets...");
        const backendUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
        const response = await fetch(`${backendUrl}/mux/assets`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to list assets: ${response.statusText}`);
        }

        const result = await response.json();
        return result || [];
    } catch (error) {
        console.error("Error listing recent Mux assets:", error);
        throw error;
    }
};
