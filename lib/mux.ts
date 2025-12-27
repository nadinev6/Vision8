import { supabase } from '../supabaseClient';

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
        const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const urlResponse = await fetch(`${backendUrl}/api/mux/upload/url`, {
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
