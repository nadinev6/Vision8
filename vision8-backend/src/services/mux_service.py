
import { Mux } from "mux-python";

class MuxService:
    def __init__(self):
        # Initialize Mux client with environment variables
        # It automatically picks up MUX_TOKEN_ID and MUX_TOKEN_SECRET
        self.mux_client = Mux()

    async def create_upload_url(self):
        """Creates a direct upload URL for client-side uploads."""
        upload = self.mux_client.Video.Uploads.create(
            new_asset_settings={"playback_policy": ["public"], "mp4_support": "standard"}
        )
        return {"upload_url": upload.url, "upload_id": upload.id}

    async def get_asset(self, asset_id):
        """Retrieves asset details."""
        return self.mux_client.Video.Assets.get(asset_id)

    async def get_playback_id(self, asset_id):
        """Retrieves playback ID for an asset."""
        asset = await self.get_asset(asset_id)
        if asset.playback_ids:
            return asset.playback_ids[0].id
        return None
    
    async def create_clip(self, asset_id, start_time, end_time):
        """Creates a clip from an existing asset."""
        clip = self.mux_client.Video.Assets.create(
            input=[{
                "url": f"mux://assets/{asset_id}",
                "start_time": start_time,
                "end_time": end_time
            }],
            playback_policy=["public"]
        )
        return clip

    async def list_assets(self):
         """Lists recent assets."""
         return self.mux_client.Video.Assets.list(limit=10)

