"""
MCP Tools for Vision8 Video Production Pipeline

Stateful tools exposed via the Model Context Protocol for the Gemini agent
to control the ComfyUI Cloud video generation workflow.
"""

import os
import asyncio
import httpx
import structlog
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum

logger = structlog.get_logger()


class PlateResolution(Enum):
    PROXY_480P = "480p"
    PROXY_720P = "720p"
    FINAL_1080P = "1080p"
    FINAL_4K = "4k"


@dataclass
class SessionState:
    """Stateful context persisted across MCP tool calls."""
    last_render_path: Optional[str] = None
    last_plate_resolution: PlateResolution = PlateResolution.PROXY_720P
    last_seed: int = 42
    environment_lock_image: Optional[str] = None
    render_history: List[Dict[str, Any]] = field(default_factory=list)
    credits_remaining: int = 4200
    
    def record_render(self, render_info: Dict[str, Any]):
        """Record a render to history and update state."""
        self.render_history.append(render_info)
        self.last_render_path = render_info.get("output_path")
        if render_info.get("resolution"):
            try:
                self.last_plate_resolution = PlateResolution(render_info["resolution"])
            except ValueError:
                pass
        if render_info.get("seed"):
            self.last_seed = render_info["seed"]


class MCPTools:
    """
    MCP Tool implementations for the Vision8 video production pipeline.
    Each tool is stateful and maintains context through SessionState.
    """
    
    def __init__(self, comfy_service, session_state: Optional[SessionState] = None):
        self.comfy = comfy_service
        self.state = session_state or SessionState()
        self.comfy_api_url = os.getenv("COMFY_URL", "127.0.0.1:8188")
    
    # =========================================================================
    # Tool: generatePlate
    # =========================================================================
    async def generate_plate(
        self,
        prompt: str,
        duration_seconds: float = 5.0,
        resolution: str = "720p",
        seed: Optional[int] = None,
        environment_lock_image: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Creates a 5–8s video plate using Wan 2.2.
        
        Args:
            prompt: The creative prompt for the video generation
            duration_seconds: Length of the plate (5-8s recommended)
            resolution: "480p", "720p", "1080p", or "4k"
            seed: Random seed for reproducibility (uses last seed if None)
            environment_lock_image: IP-Adapter image for environment consistency
            
        Returns:
            Dict with output_path, status, credits_used
        """
        logger.info("MCP Tool: generatePlate", 
                   prompt=prompt[:50], 
                   duration=duration_seconds,
                   resolution=resolution)
        
        # Use stateful seed if not provided
        effective_seed = seed or self.state.last_seed
        env_lock = environment_lock_image or self.state.environment_lock_image
        
        # Determine workflow based on resolution
        if resolution in ["480p", "720p"]:
            workflow_name = "generate_wan_plate"
            steps = 20  # Proxy uses 20 steps
            credits_estimate = 10
        else:
            workflow_name = "hero_scene"
            steps = 35  # Final uses 35 steps
            credits_estimate = 50
        
        try:
            # Build inputs for ComfyUI workflow
            inputs = {
                "USER_PROMPT": prompt,
                "WAN_SAMPLER": {"seed": effective_seed, "steps": steps}
            }
            
            if env_lock:
                inputs["IP_ADAPTER_IMAGE"] = env_lock
            
            # Execute workflow
            result_url = await self.comfy.run_workflow(workflow_name, inputs)
            
            # Update state
            render_info = {
                "output_path": result_url,
                "resolution": resolution,
                "seed": effective_seed,
                "prompt": prompt,
                "type": "plate"
            }
            self.state.record_render(render_info)
            self.state.credits_remaining -= credits_estimate
            
            if env_lock:
                self.state.environment_lock_image = env_lock
            
            logger.info("generatePlate completed", 
                       output=result_url,
                       credits_used=credits_estimate)
            
            return {
                "status": "completed",
                "output_path": result_url,
                "resolution": resolution,
                "seed": effective_seed,
                "credits_used": credits_estimate,
                "credits_remaining": self.state.credits_remaining,
                "message": f"🎬 Plate generated successfully at {resolution}"
            }
            
        except Exception as e:
            logger.error("generatePlate failed", error=str(e))
            return {
                "status": "failed",
                "error": str(e),
                "message": f"❌ Plate generation failed: {str(e)}"
            }
    
    # =========================================================================
    # Tool: upscaleExisting
    # =========================================================================
    async def upscale_existing(
        self,
        source_video: Optional[str] = None,
        denoise_strength: float = 0.35,
        target_resolution: str = "4k"
    ) -> Dict[str, Any]:
        """
        Enhances resolution of an existing video to 4K.
        
        Args:
            source_video: Path to video to upscale (uses last render if None)
            denoise_strength: Denoise pass strength (default 0.35)
            target_resolution: Target resolution ("1080p" or "4k")
            
        Returns:
            Dict with output_path, status, credits_used
        """
        logger.info("MCP Tool: upscaleExisting",
                   source=source_video or "last_render",
                   denoise=denoise_strength)
        
        # Use last render if no source specified
        video_path = source_video or self.state.last_render_path
        
        if not video_path:
            return {
                "status": "failed",
                "error": "No source video specified and no previous render available",
                "message": "❌ No video to upscale. Generate a plate first."
            }
        
        credits_estimate = 30 if target_resolution == "4k" else 15
        
        try:
            inputs = {
                "SOURCE_VIDEO": video_path,
                "DENOISE_SAMPLER": {"denoise": denoise_strength}
            }
            
            result_url = await self.comfy.run_workflow("upscale_video", inputs)
            
            render_info = {
                "output_path": result_url,
                "resolution": target_resolution,
                "source": video_path,
                "type": "upscale"
            }
            self.state.record_render(render_info)
            self.state.credits_remaining -= credits_estimate
            
            logger.info("upscaleExisting completed",
                       output=result_url,
                       credits_used=credits_estimate)
            
            return {
                "status": "completed",
                "output_path": result_url,
                "source_video": video_path,
                "target_resolution": target_resolution,
                "credits_used": credits_estimate,
                "credits_remaining": self.state.credits_remaining,
                "message": f"✨ Video upscaled to {target_resolution}"
            }
            
        except Exception as e:
            logger.error("upscaleExisting failed", error=str(e))
            return {
                "status": "failed",
                "error": str(e),
                "message": f"❌ Upscaling failed: {str(e)}"
            }
    
    # =========================================================================
    # Tool: stitchVideos
    # =========================================================================
    async def stitch_videos(
        self,
        video_segments: List[str],
        output_filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Merges multiple video segments using FFmpeg lossless concat.
        
        Args:
            video_segments: List of video paths/URLs to concatenate
            output_filename: Optional custom output filename
            
        Returns:
            Dict with output_path, status, segments_count
        """
        logger.info("MCP Tool: stitchVideos", segment_count=len(video_segments))
        
        if not video_segments or len(video_segments) < 2:
            return {
                "status": "failed",
                "error": "At least 2 video segments required for stitching",
                "message": "❌ Need at least 2 segments to stitch"
            }
        
        try:
            # Import the video generation service for concatenation
            from services.video_generation_service import video_generation_service
            
            result = await video_generation_service.concatenate_videos(
                video_segments,
                output_filename
            )
            
            if result.get("status") == "success":
                render_info = {
                    "output_path": result.get("result_url"),
                    "type": "stitch",
                    "segments": len(video_segments)
                }
                self.state.record_render(render_info)
                
                return {
                    "status": "completed",
                    "output_path": result.get("result_url"),
                    "segments_count": len(video_segments),
                    "output_filename": result.get("output_filename"),
                    "message": f"🎞️ {len(video_segments)} segments stitched successfully"
                }
            else:
                return {
                    "status": "failed",
                    "error": result.get("error", "Unknown error"),
                    "message": "❌ Stitching failed"
                }
                
        except Exception as e:
            logger.error("stitchVideos failed", error=str(e))
            return {
                "status": "failed",
                "error": str(e),
                "message": f"❌ Stitching failed: {str(e)}"
            }
    
    # =========================================================================
    # Tool: checkCredits
    # =========================================================================
    async def check_credits(self) -> Dict[str, Any]:
        """
        Query ComfyUI Cloud to check remaining credits.
        
        Returns:
            Dict with credits_remaining, credits_used, budget_status
        """
        logger.info("MCP Tool: checkCredits")
        
        try:
            # Try to query ComfyUI Cloud credits API
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    response = await client.get(
                        f"http://{self.comfy_api_url}/api/credits"
                    )
                    if response.status_code == 200:
                        data = response.json()
                        self.state.credits_remaining = data.get("remaining", self.state.credits_remaining)
                except Exception:
                    # Credits API may not be available, use local state
                    pass
            
            total_credits = 4200
            credits_used = total_credits - self.state.credits_remaining
            usage_percentage = (credits_used / total_credits) * 100
            
            if usage_percentage < 50:
                budget_status = "healthy"
                budget_emoji = "🟢"
            elif usage_percentage < 80:
                budget_status = "moderate"
                budget_emoji = "🟡"
            else:
                budget_status = "low"
                budget_emoji = "🔴"
            
            return {
                "status": "success",
                "credits_remaining": self.state.credits_remaining,
                "credits_used": credits_used,
                "total_credits": total_credits,
                "usage_percentage": round(usage_percentage, 1),
                "budget_status": budget_status,
                "render_history_count": len(self.state.render_history),
                "message": f"{budget_emoji} Credits: {self.state.credits_remaining}/{total_credits} ({budget_status})"
            }
            
        except Exception as e:
            logger.error("checkCredits failed", error=str(e))
            return {
                "status": "failed",
                "error": str(e),
                "credits_remaining": self.state.credits_remaining,
                "message": f"⚠️ Could not verify credits: {str(e)}"
            }
    
    # =========================================================================
    # Tool: getSessionContext
    # =========================================================================
    def get_session_context(self) -> Dict[str, Any]:
        """
        Get the current session state for context-aware decisions.
        
        Returns:
            Dict with session state information
        """
        return {
            "last_render_path": self.state.last_render_path,
            "last_plate_resolution": self.state.last_plate_resolution.value,
            "last_seed": self.state.last_seed,
            "environment_lock_image": self.state.environment_lock_image,
            "render_count": len(self.state.render_history),
            "credits_remaining": self.state.credits_remaining
        }
    
    # =========================================================================
    # Tool: setEnvironmentLock
    # =========================================================================
    async def set_environment_lock(self, image_path: str) -> Dict[str, Any]:
        """
        Set the IP-Adapter image for environment consistency across renders.
        
        Args:
            image_path: Path to the environment lock image
            
        Returns:
            Dict with status and confirmation
        """
        logger.info("MCP Tool: setEnvironmentLock", image=image_path)
        
        self.state.environment_lock_image = image_path
        
        return {
            "status": "success",
            "environment_lock_image": image_path,
            "message": f"🔒 Environment locked to image: {image_path}"
        }
    
    # =========================================================================
    # Tool: generateEnvironment (NEW - Environment First)
    # =========================================================================
    async def generate_environment(
        self,
        prompt: str,
        negative_prompt: str = "blurry, low quality, distorted, watermark",
        width: int = 1280,
        height: int = 720,
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate an environment/scene image for video production.
        
        This is the first step in the "Environment First" workflow:
        1. Generate environment image
        2. User approves or requests regeneration
        3. Use approved image for I2V or background replacement
        
        Args:
            prompt: Description of the environment
            negative_prompt: Things to avoid
            width: Image width
            height: Image height
            seed: Random seed (uses last seed if None)
        
        Returns:
            Dict with image_path, status, and preview URL
        """
        logger.info("MCP Tool: generateEnvironment", prompt=prompt[:50])
        
        from .workflow_builder import workflow_builder
        from .comfy_mcp_service import comfy_service
        
        effective_seed = seed or self.state.last_seed
        credits_estimate = 5  # Image generation is cheaper
        
        try:
            # Build the environment generation workflow
            graph = workflow_builder.build_environment_job(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                seed=effective_seed
            )
            
            # Execute via ComfyUI
            result_url = await comfy_service.queue_prompt(graph)
            
            # Track progress
            await comfy_service.track_progress(result_url)
            
            # Get result
            history = await comfy_service.get_history(result_url)
            image_path = self._extract_output_path(history, "images")
            
            # Update state
            self.state.last_seed = effective_seed
            self.state.credits_remaining -= credits_estimate
            
            # Store as potential environment lock
            render_info = {
                "output_path": image_path,
                "type": "environment",
                "prompt": prompt,
                "seed": effective_seed,
                "approved": False  # User must approve
            }
            self.state.render_history.append(render_info)
            
            return {
                "status": "completed",
                "image_path": image_path,
                "seed": effective_seed,
                "credits_used": credits_estimate,
                "credits_remaining": self.state.credits_remaining,
                "requires_approval": True,
                "message": f"🖼️ Environment generated. Please review and approve or regenerate."
            }
            
        except Exception as e:
            logger.error("generateEnvironment failed", error=str(e))
            return {
                "status": "failed",
                "error": str(e),
                "message": f"❌ Environment generation failed: {str(e)}"
            }
    
    # =========================================================================
    # Tool: regenerateEnvironment (User rejected)
    # =========================================================================
    async def regenerate_environment(
        self,
        prompt: str,
        modifications: Optional[str] = None,
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Regenerate environment with modifications (user rejected previous).
        
        Args:
            prompt: Updated prompt (or original + modifications)
            modifications: What to change from previous attempt
            seed: New seed (auto-increments if None)
        
        Returns:
            Dict with new image_path
        """
        logger.info("MCP Tool: regenerateEnvironment", modifications=modifications)
        
        # Auto-increment seed for variety
        new_seed = seed or (self.state.last_seed + 1)
        
        # Combine with modifications if provided
        if modifications:
            full_prompt = f"{prompt}, {modifications}"
        else:
            full_prompt = prompt
        
        return await self.generate_environment(
            prompt=full_prompt,
            seed=new_seed
        )
    
    # =========================================================================
    # Tool: generateI2VFromEnvironment
    # =========================================================================
    async def generate_i2v_from_environment(
        self,
        environment_image: Optional[str] = None,
        prompt: str = "",
        duration_seconds: float = 5.0,
        seed: Optional[int] = None,
        apply_enhancements: bool = True
    ) -> Dict[str, Any]:
        """
        Generate video from an approved environment image using Wan 2.2 I2V.
        
        Args:
            environment_image: Path to environment (uses last generated if None)
            prompt: Motion/action prompt for the video
            duration_seconds: Video length (5-8s)
            seed: Random seed
            apply_enhancements: Auto-apply suggested enhancements
        
        Returns:
            Dict with video_path, status
        """
        logger.info("MCP Tool: generateI2VFromEnvironment")
        
        from .workflow_builder import workflow_builder
        from .graph_mutator import graph_mutator
        from .comfy_mcp_service import comfy_service
        
        # Use last environment if not specified
        if not environment_image:
            # Find last environment render
            for render in reversed(self.state.render_history):
                if render.get("type") == "environment":
                    environment_image = render.get("output_path")
                    break
        
        if not environment_image:
            return {
                "status": "failed",
                "error": "No environment image available. Generate one first.",
                "message": "❌ No environment image. Use generateEnvironment first."
            }
        
        effective_seed = seed or self.state.last_seed
        num_frames = int(duration_seconds * 24)
        credits_estimate = 25
        
        try:
            # Build I2V workflow
            graph = workflow_builder.build_wan_i2v_job(
                image_path=environment_image,
                prompt=prompt,
                seed=effective_seed,
                steps=20,
                num_frames=num_frames,
                ip_adapter_image=self.state.environment_lock_image
            )
            
            # Auto-enhance if requested
            if apply_enhancements:
                graph = graph_mutator.auto_enhance(graph, prompt, "i2v")
            
            # Execute
            prompt_id = await comfy_service.queue_prompt(graph)
            await comfy_service.track_progress(prompt_id)
            history = await comfy_service.get_history(prompt_id)
            video_path = self._extract_output_path(history, "videos")
            
            # Update state
            render_info = {
                "output_path": video_path,
                "type": "i2v",
                "source_environment": environment_image,
                "seed": effective_seed
            }
            self.state.record_render(render_info)
            self.state.credits_remaining -= credits_estimate
            
            return {
                "status": "completed",
                "video_path": video_path,
                "environment_used": environment_image,
                "seed": effective_seed,
                "credits_used": credits_estimate,
                "credits_remaining": self.state.credits_remaining,
                "message": f"🎬 I2V video generated from environment"
            }
            
        except Exception as e:
            logger.error("generateI2VFromEnvironment failed", error=str(e))
            return {
                "status": "failed",
                "error": str(e),
                "message": f"❌ I2V generation failed: {str(e)}"
            }
    
    # =========================================================================
    # Tool: replaceVideoBackground (Pro-Realism)
    # =========================================================================
    async def replace_video_background(
        self,
        source_video: str,
        environment_image: Optional[str] = None,
        apply_ic_light: bool = True,
        ic_light_intensity: float = 1.0
    ) -> Dict[str, Any]:
        """
        Replace video background with generated environment.
        
        Uses SAM2 + Video Mask Propagator for stable segmentation,
        and IC-Light for dynamic relighting.
        
        Args:
            source_video: Talking-head video to process
            environment_image: New background (uses last environment if None)
            apply_ic_light: Apply IC-Light relighting (default True)
            ic_light_intensity: IC-Light strength
        
        Returns:
            Dict with composited video path
        """
        logger.info("MCP Tool: replaceVideoBackground", 
                   source=source_video,
                   ic_light=apply_ic_light)
        
        from .workflow_builder import workflow_builder
        from .comfy_mcp_service import comfy_service
        
        # Use last environment if not specified
        if not environment_image:
            for render in reversed(self.state.render_history):
                if render.get("type") == "environment":
                    environment_image = render.get("output_path")
                    break
        
        if not environment_image:
            return {
                "status": "failed",
                "error": "No environment image. Generate one first.",
                "message": "❌ Generate an environment image first."
            }
        
        credits_estimate = 40
        
        try:
            # Build background replacement workflow
            graph = workflow_builder.build_background_replace_job(
                source_video_path=source_video,
                environment_image_path=environment_image,
                apply_ic_light=apply_ic_light,
                ic_light_intensity=ic_light_intensity
            )
            
            # Execute
            prompt_id = await comfy_service.queue_prompt(graph)
            await comfy_service.track_progress(prompt_id)
            history = await comfy_service.get_history(prompt_id)
            video_path = self._extract_output_path(history, "videos")
            
            render_info = {
                "output_path": video_path,
                "type": "bg_replace",
                "source_video": source_video,
                "environment": environment_image
            }
            self.state.record_render(render_info)
            self.state.credits_remaining -= credits_estimate
            
            return {
                "status": "completed",
                "video_path": video_path,
                "source_video": source_video,
                "environment_used": environment_image,
                "ic_light_applied": apply_ic_light,
                "credits_used": credits_estimate,
                "credits_remaining": self.state.credits_remaining,
                "message": f"✨ Background replaced with IC-Light relighting"
            }
            
        except Exception as e:
            logger.error("replaceVideoBackground failed", error=str(e))
            return {
                "status": "failed",
                "error": str(e),
                "message": f"❌ Background replacement failed: {str(e)}"
            }
    
    # =========================================================================
    # Tool: injectNode (Dynamic Node Injection)
    # =========================================================================
    async def inject_node(
        self,
        node_type: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Dynamically inject a node into the current/next workflow.
        
        Agent can suggest nodes like ControlNet, IC-Light, ColorGrade
        based on user requests (e.g., "make it more 3D").
        
        Args:
            node_type: Node to inject (DepthControlNet, CannyControlNet, 
                       ICLight, ColorGrade, IPAdapter)
            params: Parameters for the node
        
        Returns:
            Dict confirming injection
        """
        logger.info("MCP Tool: injectNode", node_type=node_type)
        
        from .graph_mutator import graph_mutator
        
        # Store injection request for next workflow build
        if not hasattr(self.state, 'pending_injections'):
            self.state.pending_injections = []
        
        self.state.pending_injections.append({
            "node_type": node_type,
            "params": params or {}
        })
        
        return {
            "status": "queued",
            "node_type": node_type,
            "params": params,
            "message": f"✅ {node_type} will be injected into the next render"
        }
    
    # =========================================================================
    # Tool: suggestEnhancements
    # =========================================================================
    async def suggest_enhancements(self, prompt: str) -> Dict[str, Any]:
        """
        Analyze prompt and suggest nodes to enhance the production.
        
        Args:
            prompt: The creative prompt to analyze
        
        Returns:
            List of suggested node injections
        """
        logger.info("MCP Tool: suggestEnhancements", prompt=prompt[:50])
        
        from .graph_mutator import graph_mutator
        
        suggestions = graph_mutator.suggest_enhancements(prompt)
        
        return {
            "status": "success",
            "suggestions": [
                {"node_type": s[0], "params": s[1]} for s in suggestions
            ],
            "suggestion_count": len(suggestions),
            "message": f"💡 Found {len(suggestions)} enhancement suggestions"
        }
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    def _extract_output_path(self, history: Dict[str, Any], output_type: str = "videos") -> Optional[str]:
        """Extract output path from ComfyUI history."""
        outputs = history.get("outputs", {})
        for node_id, node_output in outputs.items():
            if output_type in node_output:
                items = node_output[output_type]
                if items:
                    filename = items[0].get("filename")
                    return f"http://{self.comfy_api_url}/view?filename={filename}&type=output"
        return None


# =========================================================================
# MCP Tool Registry (Extended)
# =========================================================================
MCP_TOOL_DEFINITIONS = [
    {
        "name": "generatePlate",
        "description": "Creates a 5-8s video plate using Wan 2.2 with environment lock support",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Creative prompt for video generation"},
                "duration_seconds": {"type": "number", "description": "Plate duration (5-8s)", "default": 5.0},
                "resolution": {"type": "string", "enum": ["480p", "720p", "1080p", "4k"], "default": "720p"},
                "seed": {"type": "integer", "description": "Random seed for reproducibility"},
                "environment_lock_image": {"type": "string", "description": "IP-Adapter image path"}
            },
            "required": ["prompt"]
        }
    },
    {
        "name": "upscaleExisting",
        "description": "Enhances resolution with 0.35 denoise pass, outputs 4K",
        "parameters": {
            "type": "object",
            "properties": {
                "source_video": {"type": "string", "description": "Path to video to upscale (uses last render if omitted)"},
                "denoise_strength": {"type": "number", "description": "Denoise strength (0.0-1.0)", "default": 0.35},
                "target_resolution": {"type": "string", "enum": ["1080p", "4k"], "default": "4k"}
            }
        }
    },
    {
        "name": "stitchVideos",
        "description": "Merges multiple video segments using FFmpeg lossless concat",
        "parameters": {
            "type": "object",
            "properties": {
                "video_segments": {"type": "array", "items": {"type": "string"}, "description": "List of video paths to concatenate"},
                "output_filename": {"type": "string", "description": "Optional custom output filename"}
            },
            "required": ["video_segments"]
        }
    },
    {
        "name": "checkCredits",
        "description": "Query ComfyUI Cloud to see remaining credits from the 4,200 budget",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "getSessionContext",
        "description": "Get current session state including last render path and seed",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "setEnvironmentLock",
        "description": "Set IP-Adapter image for environment consistency across all renders",
        "parameters": {
            "type": "object",
            "properties": {
                "image_path": {"type": "string", "description": "Path to environment lock image"}
            },
            "required": ["image_path"]
        }
    },
    # NEW: Environment-First Tools
    {
        "name": "generateEnvironment",
        "description": "Generate a scene/room image to use as video background or I2V source",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Description of the environment (e.g., 'Shark Tank boardroom')"},
                "negative_prompt": {"type": "string", "description": "What to avoid"},
                "width": {"type": "integer", "default": 1280},
                "height": {"type": "integer", "default": 720},
                "seed": {"type": "integer", "description": "Random seed"}
            },
            "required": ["prompt"]
        }
    },
    {
        "name": "regenerateEnvironment",
        "description": "Regenerate environment if user is unsatisfied with previous result",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Updated prompt"},
                "modifications": {"type": "string", "description": "What to change (e.g., 'add more volumetric lighting')"},
                "seed": {"type": "integer", "description": "New seed for variety"}
            },
            "required": ["prompt"]
        }
    },
    {
        "name": "generateI2VFromEnvironment",
        "description": "Create video from approved environment image using Wan 2.2 I2V",
        "parameters": {
            "type": "object",
            "properties": {
                "environment_image": {"type": "string", "description": "Path to environment (uses last if omitted)"},
                "prompt": {"type": "string", "description": "Motion/action prompt"},
                "duration_seconds": {"type": "number", "default": 5.0},
                "seed": {"type": "integer"},
                "apply_enhancements": {"type": "boolean", "default": True}
            }
        }
    },
    {
        "name": "replaceVideoBackground",
        "description": "Replace talking-head video background with generated environment. Auto-applies SAM2 + IC-Light.",
        "parameters": {
            "type": "object",
            "properties": {
                "source_video": {"type": "string", "description": "Talking-head video to process"},
                "environment_image": {"type": "string", "description": "New background (uses last environment if omitted)"},
                "apply_ic_light": {"type": "boolean", "default": True, "description": "Apply IC-Light relighting"},
                "ic_light_intensity": {"type": "number", "default": 1.0}
            },
            "required": ["source_video"]
        }
    },
    {
        "name": "injectNode",
        "description": "Dynamically inject a node (ControlNet, IC-Light, etc.) into the next render",
        "parameters": {
            "type": "object",
            "properties": {
                "node_type": {"type": "string", "enum": ["DepthControlNet", "CannyControlNet", "ICLight", "ColorGrade", "IPAdapter"]},
                "params": {"type": "object", "description": "Node parameters"}
            },
            "required": ["node_type"]
        }
    },
    {
        "name": "suggestEnhancements",
        "description": "Analyze prompt and suggest nodes to improve the production",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Creative prompt to analyze"}
            },
            "required": ["prompt"]
        }
    }
]
