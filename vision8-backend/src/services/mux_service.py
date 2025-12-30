import os
import mux_python
from mux_python.rest import ApiException
import structlog
import asyncio
from typing import Optional

logger = structlog.get_logger()

class MuxService:
    def __init__(self):
        try:
            token_id = os.getenv('MUX_TOKEN_ID')
            token_secret = os.getenv('MUX_TOKEN_SECRET')

            if not token_id or not token_secret:
                logger.error("Mux credentials not found in environment variables")
                raise ValueError("Mux credentials not configured")

            self.configuration = mux_python.Configuration()
            self.configuration.username = token_id
            self.configuration.password = token_secret
            self.api_client = mux_python.ApiClient(self.configuration)

            # Initialize APIs
            self.assets_api = mux_python.AssetsApi(self.api_client)
            self.uploads_api = mux_python.DirectUploadsApi(self.api_client)
            self.metrics_api = mux_python.MetricsApi(self.api_client)
            self.playback_ids_api = mux_python.PlaybackIDApi(self.api_client)

            logger.info("MuxService initialized successfully")
            # Note: Data API might require different auth or structure depending on version

        except Exception as e:
            logger.error(f"Failed to initialize MuxService: {e}")
            raise e

    async def create_upload_url(self):
        """Creates a direct upload URL for client-side uploads."""
        create_upload_request = mux_python.CreateUploadRequest(
            new_asset_settings=mux_python.CreateAssetRequest(playback_policy=[mux_python.PlaybackPolicy.PUBLIC]),
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
        """Retrieves asset details. Handles both Asset IDs and Playback IDs."""
        try:
            logger.info(f"Attempting to get Mux asset: {asset_id}")
            loop = asyncio.get_event_loop()
            
            # Direct attempt
            try:
                response = await loop.run_in_executor(None, lambda: self.assets_api.get_asset(asset_id))
                logger.info(f"Successfully retrieved Mux asset: {asset_id}")
                return response.data
            except ApiException as e:
                # Robust check for Playback ID provided error
                # Check status code and str(e) which contains the body
                error_str = str(e)
                if (e.status == 400 or e.status == 404) and ("Playback ID" in error_str or "playback" in error_str.lower()):
                    logger.info("Provided ID looks like a Playback ID, attempting to resolve Asset ID", playback_id=asset_id)
                    resolved_asset_id = await self.resolve_asset_id_from_playback_id(asset_id)
                    if resolved_asset_id:
                        logger.info(f"Resolved Playback ID {asset_id} to Asset ID {resolved_asset_id}")
                        response = await loop.run_in_executor(None, lambda: self.assets_api.get_asset(resolved_asset_id))
                        return response.data
                raise e
                
        except ApiException as e:
            logger.error(f"Mux get asset failed for {asset_id}", error=str(e), status_code=e.status if hasattr(e, 'status') else 'unknown')
            return None
        except Exception as e:
            logger.error(f"Unexpected error getting Mux asset {asset_id}", error=str(e))
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

    async def resolve_asset_id_from_playback_id(self, playback_id: str) -> Optional[str]:
        """Resolves a Mux Asset ID from a Playback ID using direct API."""
        try:
            logger.info("Resolving asset ID from playback ID", playback_id=playback_id)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, 
                lambda: self.playback_ids_api.get_playback_id(playback_id)
            )
            
            # The response data contains the object_id which is the asset_id if object_type is 'asset'
            if response and response.data and response.data.object_type == 'asset':
                asset_id = response.data.object_id
                logger.info("Successfully resolved playback ID to asset ID", 
                           playback_id=playback_id, asset_id=asset_id)
                return asset_id
            
            logger.warning("Playback ID resolved to non-asset object", 
                          playback_id=playback_id, object_type=getattr(response.data, 'object_type', 'unknown'))
            return None
        except Exception as e:
            logger.error("Failed to resolve asset ID from playback ID", error=str(e), playback_id=playback_id)
            return None

    async def list_assets(self):
         """Lists recent assets."""
         try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: self.assets_api.list_assets(limit=10))
            return response.data
         except ApiException as e:
            logger.error("Mux list assets failed", error=str(e))
            return []

    async def get_asset_with_engagement(self, asset_id: str, timeframe: list = None):
        """Fetches asset details along with engagement metrics."""
        try:
            # Get basic asset info
            asset = await self.get_asset(asset_id)
            if not asset:
                return None

            # Get engagement metrics for this specific asset
            tf = timeframe or ['7:days']
            loop = asyncio.get_event_loop()

            # Get views for this asset
            views_result = await loop.run_in_executor(
                None,
                lambda: self.metrics_api.get_metric_timeseries_data(
                    metric_id='views',
                    timeframe=tf,
                    filters=[f"asset_id:{asset_id}"]
                )
            )

            # Get watch time for this asset
            watch_time_result = await loop.run_in_executor(
                None,
                lambda: self.metrics_api.get_metric_timeseries_data(
                    metric_id='watch_time',
                    timeframe=tf,
                    filters=[f"asset_id:{asset_id}"]
                )
            )

            # Calculate total views and watch time
            total_views = sum(item[1] for item in views_result.data) if views_result.data else 0
            total_watch_time = sum(item[1] for item in watch_time_result.data) if watch_time_result.data else 0

            # Format watch time
            hours = int(total_watch_time // 3600)
            minutes = int((total_watch_time % 3600) // 60)
            formatted_watch_time = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

            return {
                "asset": asset,
                "engagement": {
                    "total_views": total_views,
                    "total_watch_time": total_watch_time,
                    "formatted_watch_time": formatted_watch_time,
                    "average_view_duration": total_watch_time / total_views if total_views > 0 else 0,
                    "period": tf[0]
                }
            }

        except Exception as e:
            logger.error(f"Error fetching asset with engagement: {e}")
            return None
    async def get_user_assets_with_engagement(self, user_id: str = None, timeframe: list = None):
        """Fetches all assets for a user with engagement metrics."""
        try:
            # Get all assets (in a real implementation, this would be filtered by user)
            tf = timeframe or ['7:days']
            loop = asyncio.get_event_loop()

            # List all assets
            assets_response = await loop.run_in_executor(None, lambda: self.assets_api.list_assets(limit=100))
            assets = assets_response.data

            if not assets:
                return []

            # For each asset, get engagement metrics
            assets_with_engagement = []
            for asset in assets:
                try:
                    # Get views for this asset
                    views_result = await loop.run_in_executor(
                        None,
                        lambda: self.metrics_api.get_metric_timeseries_data(
                            metric_id='views',
                            timeframe=tf,
                            filters=[f"asset_id:{asset.id}"]
                        )
                    )

                    # Get watch time for this asset
                    watch_time_result = await loop.run_in_executor(
                        None,
                        lambda: self.metrics_api.get_metric_timeseries_data(
                            metric_id='watch_time',
                            timeframe=tf,
                            filters=[f"asset_id:{asset.id}"]
                        )
                    )

                    # Calculate totals
                    total_views = sum(item[1] for item in views_result.data) if views_result.data else 0
                    total_watch_time = sum(item[1] for item in watch_time_result.data) if watch_time_result.data else 0

                    # Format watch time
                    hours = int(total_watch_time // 3600)
                    minutes = int((total_watch_time % 3600) // 60)
                    formatted_watch_time = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

                    assets_with_engagement.append({
                        "asset_id": asset.id,
                        "title": getattr(asset, 'name', f"Video {asset.id}"),
                        "status": getattr(asset, 'status', 'unknown'),
                        "duration": getattr(asset, 'duration', 0),
                        "created_at": getattr(asset, 'created_at', None),
                        "playback_id": getattr(asset.playback_ids[0], 'id', None) if hasattr(asset, 'playback_ids') and asset.playback_ids else None,
                        "engagement": {
                            "total_views": total_views,
                            "total_watch_time": total_watch_time,
                            "formatted_watch_time": formatted_watch_time,
                            "average_view_duration": total_watch_time / total_views if total_views > 0 else 0
                        }
                    })

                except Exception as asset_error:
                    logger.error(f"Error processing asset {asset.id}: {asset_error}")
                    # Add asset without engagement data
                    assets_with_engagement.append({
                        "asset_id": asset.id,
                        "title": getattr(asset, 'name', f"Video {asset.id}"),
                        "status": getattr(asset, 'status', 'unknown'),
                        "duration": getattr(asset, 'duration', 0),
                        "created_at": getattr(asset, 'created_at', None),
                        "playback_id": getattr(asset.playback_ids[0], 'id', None) if hasattr(asset, 'playback_ids') and asset.playback_ids else None,
                        "engagement": {
                            "total_views": 0,
                            "total_watch_time": 0,
                            "formatted_watch_time": "0m",
                            "average_view_duration": 0
                        }
                    })

            return assets_with_engagement

        except Exception as e:
            logger.error(f"Error fetching user assets with engagement: {e}")
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

            # Get average view duration
            avg_duration_result = await loop.run_in_executor(
                None,
                lambda: self.metrics_api.get_overall_values(
                    metric_id='avg_view_duration',
                    timeframe=tf
                )
            )

            # Get completion percentage
            completion_result = await loop.run_in_executor(
                None,
                lambda: self.metrics_api.get_overall_values(
                    metric_id='avg_view_completion_percentage',
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
            avg_view_duration = avg_duration_result.data.value if avg_duration_result.data else 0
            avg_completion = completion_result.data.value if completion_result.data else 0
            
            # Format watch time
            hours = int(total_watch_time // 3600)
            minutes = int((total_watch_time % 3600) // 60)
            formatted_watch_time = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

            # Format avg duration
            d_mins = int(avg_view_duration // 60)
            d_secs = int(avg_view_duration % 60)
            formatted_avg_duration = f"{d_mins}:{d_secs:02}" if avg_view_duration > 0 else "0:00"
            
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
                "avg_view_duration": avg_view_duration,
                "formatted_avg_duration": formatted_avg_duration,
                "avg_completion_percentage": avg_completion,
                "chart_data": chart_data,
                "period": tf[0],
                "status": "real"
            }
        except Exception as e:
            logger.error(f"Error fetching Mux analytics: {e}")
            return None
