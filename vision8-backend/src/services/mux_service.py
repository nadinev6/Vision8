import os
import mux_python
from mux_python.rest import ApiException
import structlog
import asyncio

logger = structlog.get_logger()

class MuxService:
    def __init__(self):
        self.configuration = mux_python.Configuration()
        self.configuration.username = os.getenv('MUX_TOKEN_ID')
        self.configuration.password = os.getenv('MUX_TOKEN_SECRET')
        self.api_client = mux_python.ApiClient(self.configuration)
        
        # Initialize APIs
        self.assets_api = mux_python.AssetsApi(self.api_client)
        self.uploads_api = mux_python.DirectUploadsApi(self.api_client)
        self.metrics_api = mux_python.MetricsApi(self.api_client) 
        # Note: Data API might require different auth or structure depending on version

    async def create_upload_url(self):
        """Creates a direct upload URL for client-side uploads."""
        create_upload_request = mux_python.CreateUploadRequest(
            new_asset_settings=mux_python.CreateAssetRequest(playback_policy=[mux_python.PlaybackPolicy.PUBLIC], mp4_support="standard"),
            cors_origin="*"
        )
        try:
            loop = asyncio.get_event_loop()
            upload = await loop.run_in_executor(None, lambda: self.uploads_api.create_direct_upload(create_upload_request=create_upload_request))
            return {"upload_url": upload.data.url, "upload_id": upload.data.id}
        except ApiException as e:
            logger.error("Mux create upload failed", error=str(e))
            raise e

    async def get_asset(self, asset_id):
        """Retrieves asset details."""
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: self.assets_api.get_asset(asset_id))
            return response.data
        except ApiException as e:
            logger.error("Mux get asset failed", error=str(e))
            return None

    async def get_playback_id(self, asset_id):
        """Retrieves playback ID for an asset."""
        asset = await self.get_asset(asset_id)
        if asset and asset.playback_ids:
            return asset.playback_ids[0].id
        return None
    
    async def create_clip(self, asset_id, start_time, end_time):
        """Creates a clip from an existing asset."""
        # Note: This is simplified. Mux clipping usually creates a new asset with input settings.
        input_settings = [
            mux_python.InputSettings(
                url=f"mux://assets/{asset_id}",
                start_time=start_time,
                end_time=end_time
            )
        ]
        create_asset_request = mux_python.CreateAssetRequest(
            input=input_settings,
            playback_policy=[mux_python.PlaybackPolicy.PUBLIC]
        )
        try:
            loop = asyncio.get_event_loop()
            clip = await loop.run_in_executor(None, lambda: self.assets_api.create_asset(create_asset_request=create_asset_request))
            return clip.data
        except ApiException as e:
             logger.error("Mux create clip failed", error=str(e))
             raise e

    async def list_assets(self):
         """Lists recent assets."""
         try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: self.assets_api.list_assets(limit=10))
            return response.data
         except ApiException as e:
            logger.error("Mux list assets failed", error=str(e))
            return []

    async def get_real_analytics(self, timeframe: list = None):
        """Fetches real analytics data from Mux Data API."""
        try:
            tf = timeframe or ['7:days']
            loop = asyncio.get_event_loop()
            
            # Initialize data API for metrics
            # Mux Data API metrics: 'views', 'viewer_experience_score', 'watch_time', 'unique_viewers'
            
            # Get total views
            views_result = await loop.run_in_executor(
                None, 
                lambda: self.metrics_api.get_overall_values(
                    metric_id='views', 
                    timeframe=tf
                )
            )
            
            # Get total watch time (in seconds)
            watch_time_result = await loop.run_in_executor(
                None, 
                lambda: self.metrics_api.get_overall_values(
                    metric_id='watch_time', 
                    timeframe=tf
                )
            )
            
            # Get unique viewers
            unique_viewers_result = await loop.run_in_executor(
                None,
                lambda: self.metrics_api.get_overall_values(
                    metric_id='unique_viewers',
                    timeframe=tf
                )
            )
            
            # Get timeseries data for chart
            timeseries_result = await loop.run_in_executor(
                None,
                lambda: self.metrics_api.get_metric_timeseries_data(
                    metric_id='views',
                    timeframe=tf
                )
            )
            
            total_views = views_result.data.value if views_result.data else 0
            total_watch_time = watch_time_result.data.value if watch_time_result.data else 0
            unique_viewers = unique_viewers_result.data.value if unique_viewers_result.data else 0
            
            # Format watch time
            hours = int(total_watch_time // 3600)
            minutes = int((total_watch_time % 3600) // 60)
            formatted_watch_time = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
            
            # Process timeseries for chart
            chart_data = []
            if timeseries_result.data:
                for item in timeseries_result.data:
                    chart_data.append([item[0], item[1]])  # [timestamp, value]
            
            return {
                "total_views": total_views,
                "total_watch_time": total_watch_time,
                "formatted_watch_time": formatted_watch_time,
                "unique_viewers": unique_viewers,
                "chart_data": chart_data,
                "period": tf[0],
                "status": "real"
            }
        except Exception as e:
            logger.error(f"Error fetching Mux analytics: {e}")
            return None

