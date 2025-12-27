
import fal_client
import os
import asyncio

class FalService:
    def __init__(self, key=None):
         # fal-client automatically reads FAL_KEY env var
         # but we can check if it's set
         self.key = key or os.getenv("FAL_KEY")
         if not self.key:
             print("Warning: FAL_KEY not set")

    async def run_model(self, model_id, arguments):
        """Generic wrapper to run any fal model."""
        # Using asyncio.to_thread because the basic fal_client.submit might be synchronous or we want to ensure non-blocking
        handler = await asyncio.to_thread(fal_client.submit, model_id, arguments=arguments)
        
        # If we want to wait for the result immediately (blocking in thread) or return the result
        # For video, it's usually async so we might get a request_id or result depending on the queue
        # Here we assume we wait for the result for simplicity in this MVP, 
        # but for production you'd want to use webhooks or `fal_client.subscribe`.
        
        # Using subscribe to wait for log and result
        result = await asyncio.to_thread(fal_client.subscribe, model_id, arguments=arguments)
        return result

    async def generate_video(self, model_id, prompt, num_frames=24, duration=4):
        """Generates video using a specified model."""
        # Common arguments, might vary by model
        args = {
            "prompt": prompt,
            # Some models use different param names (e.g. video_size, num_frames)
            # Adjusting to common baseline
        }
        
        # Model specific tweaks could go here
        if "fast-svd" in model_id:
             args["video_size"] = "landscape_4_3"
        elif "hunyuan" in model_id:
             args["num_frames"] = num_frames
        
        return await self.run_model(model_id, args)

    async def generate_sdxl_video(self, prompt):
        return await self.generate_video("fal-ai/fast-svd", prompt)

    async def generate_flux_video(self, prompt):
        # Using a high quality video model as 'premium' placeholder
        # e.g. hunyuan-video or luma-dream-machine if available on fal
        return await self.generate_video("fal-ai/hunyuan-video", prompt)
