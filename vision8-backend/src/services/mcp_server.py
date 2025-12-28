"""
MCP Server for Vision8 Video Production Pipeline

Stateful Model Context Protocol server that acts as middleware between
the Gemini agent (Technical Director) and ComfyUI Cloud.

Features:
- Tool discovery from workflow JSON files
- Stateful session management for context memory
- Hardware abstraction for ComfyUI Cloud connection
"""

import os
import json
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional, List, Callable
import structlog

from services.mcp_tools import MCPTools, SessionState, MCP_TOOL_DEFINITIONS
from services.comfy_mcp_service import comfy_service

logger = structlog.get_logger()


class MCPServer:
    """
    Stateful MCP Server that bridges the Gemini agent and ComfyUI Cloud.
    
    Maintains session context across tool calls, enabling the agent to:
    - Remember previous renders and their file paths
    - Chain operations (generate plate → upscale → stitch)
    - Track budget/credits
    - Lock environment consistency with IP-Adapter
    """
    
    def __init__(self):
        self.session_state = SessionState()
        self.tools = MCPTools(comfy_service, self.session_state)
        self.workflows_dir = Path(os.getenv("COMFY_WORKFLOWS_DIR", "./workflows"))
        self.discovered_workflows: List[Dict[str, Any]] = []
        
        # Tool dispatch map
        self._tool_handlers: Dict[str, Callable] = {
            "generatePlate": self._handle_generate_plate,
            "upscaleExisting": self._handle_upscale_existing,
            "stitchVideos": self._handle_stitch_videos,
            "checkCredits": self._handle_check_credits,
            "getSessionContext": self._handle_get_session_context,
            "setEnvironmentLock": self._handle_set_environment_lock,
            "analyzeVideoScene": self._handle_analyze_video_scene,
            "listVideoObjects": self._handle_list_video_objects,
            "transcribeVideoAudio": self._handle_transcribe_video_audio,
            "analyzeVideo": self._handle_analyze_video,
            "searchVideoContent": self._handle_search_video_content,
            "getVideoDetails": self._handle_get_video_details,
            "deleteVideoData": self._handle_delete_video_data,
        }
        
        # Discover workflows on init
        self._discover_workflows()
    
    # =========================================================================
    # Workflow Discovery
    # =========================================================================
    def _discover_workflows(self) -> List[Dict[str, Any]]:
        """
        Scan the workflows directory and expose available workflows as tools.
        """
        self.discovered_workflows = []
        
        if not self.workflows_dir.exists():
            logger.warning("Workflows directory not found", path=str(self.workflows_dir))
            return []
        
        for workflow_file in self.workflows_dir.glob("*.json"):
            try:
                with open(workflow_file, "r") as f:
                    workflow = json.load(f)
                
                # Extract workflow metadata
                workflow_name = workflow_file.stem
                node_titles = []
                
                for node_id, node in workflow.items():
                    if isinstance(node, dict) and "_meta" in node:
                        title = node["_meta"].get("title")
                        if title:
                            node_titles.append(title)
                
                self.discovered_workflows.append({
                    "name": workflow_name,
                    "file": str(workflow_file),
                    "input_nodes": [t for t in node_titles if not t.startswith("OUTPUT")],
                    "has_output": any("OUTPUT" in t for t in node_titles)
                })
                
                logger.info("Discovered workflow", 
                           name=workflow_name, 
                           inputs=len(node_titles))
                
            except Exception as e:
                logger.error("Failed to parse workflow", file=str(workflow_file), error=str(e))
        
        return self.discovered_workflows
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Return all available MCP tools for agent discovery.
        """
        # Combine static tool definitions with discovered workflows
        tools = MCP_TOOL_DEFINITIONS.copy()
        
        # Add discovered workflows as additional tools
        for workflow in self.discovered_workflows:
            if workflow["name"] not in ["generate_wan_plate", "upscale_video", "lipsync", 
                                         "hallucination_scene", "hero_scene"]:
                # Add custom workflows as generic tools
                tools.append({
                    "name": f"runWorkflow_{workflow['name']}",
                    "description": f"Execute custom ComfyUI workflow: {workflow['name']}",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "inputs": {
                                "type": "object",
                                "description": f"Input values for nodes: {', '.join(workflow['input_nodes'])}"
                            }
                        }
                    }
                })
        
        return tools
    
    # =========================================================================
    # Tool Execution
    # =========================================================================
    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute an MCP tool by name with given parameters.
        
        This is the main entry point for the Gemini agent to call tools.
        The server maintains stateful context across calls.
        """
        logger.info("MCP executing tool", tool=tool_name, params=list(parameters.keys()))
        
        handler = self._tool_handlers.get(tool_name)
        
        if handler:
            return await handler(parameters)
        
        # Check for custom workflow tools
        if tool_name.startswith("runWorkflow_"):
            workflow_name = tool_name.replace("runWorkflow_", "")
            return await self._handle_custom_workflow(workflow_name, parameters)
        
        return {
            "status": "error",
            "error": f"Unknown tool: {tool_name}",
            "available_tools": [t["name"] for t in self.get_available_tools()]
        }
    
    # =========================================================================
    # Tool Handlers
    # =========================================================================
    async def _handle_generate_plate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle generatePlate tool call."""
        return await self.tools.generate_plate(
            prompt=params.get("prompt", ""),
            duration_seconds=params.get("duration_seconds", 5.0),
            resolution=params.get("resolution", "720p"),
            seed=params.get("seed"),
            environment_lock_image=params.get("environment_lock_image")
        )
    
    async def _handle_upscale_existing(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle upscaleExisting tool call."""
        return await self.tools.upscale_existing(
            source_video=params.get("source_video"),
            denoise_strength=params.get("denoise_strength", 0.35),
            target_resolution=params.get("target_resolution", "4k")
        )
    
    async def _handle_stitch_videos(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle stitchVideos tool call."""
        return await self.tools.stitch_videos(
            video_segments=params.get("video_segments", []),
            output_filename=params.get("output_filename")
        )
    
    async def _handle_check_credits(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle checkCredits tool call."""
        return await self.tools.check_credits()
    
    async def _handle_get_session_context(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle getSessionContext tool call."""
        return self.tools.get_session_context()
    
    async def _handle_set_environment_lock(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle setEnvironmentLock tool call."""
        return await self.tools.set_environment_lock(
            image_path=params.get("image_path", "")
        )
    
    async def _handle_analyze_video_scene(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle analyzeVideoScene tool call."""
        return await self.tools.analyze_video_scene(
            video_url=params.get("video_url"),
            analysis_type=params.get("analysis_type", "comprehensive"),
            video_name=params.get("video_name")
        )
    
    async def _handle_list_video_objects(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle listVideoObjects tool call."""
        return await self.tools.list_video_objects(
            video_url=params.get("video_url"),
            object_types=params.get("object_types"),
            video_name=params.get("video_name")
        )
    
    async def _handle_transcribe_video_audio(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle transcribeVideoAudio tool call."""
        return await self.tools.transcribe_video_audio(
            video_url=params.get("video_url"),
            language=params.get("language", "auto"),
            video_name=params.get("video_name")
        )
    
    async def _handle_search_video_content(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle searchVideoContent tool call."""
        return await self.tools.search_video_content(
            query=params.get("query", ""),
            video_urls=params.get("video_urls"),
            search_type=params.get("search_type", "semantic"),
            max_results=params.get("max_results", 10)
        )
    
    async def _handle_get_video_details(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle getVideoDetails tool call."""
        return await self.tools.get_video_details(
            video_url=params.get("video_url"),
            video_name=params.get("video_name")
        )
    
    async def _handle_delete_video_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle deleteVideoData tool call."""
        return await self.tools.delete_video_data(
            video_url=params.get("video_url"),
            video_name=params.get("video_name")
        )
    
    async def _handle_analyze_video(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle analyzeVideo tool call."""
        return await self.tools.analyze_video(
            video_url=params.get("video_url"),
            video_name=params.get("video_name")
        )

    async def _handle_custom_workflow(self, workflow_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle execution of a custom discovered workflow."""
        try:
            inputs = params.get("inputs", {})
            result_url = await comfy_service.run_workflow(workflow_name, inputs)
            
            return {
                "status": "completed",
                "output_path": result_url,
                "workflow": workflow_name,
                "message": f"✅ Custom workflow '{workflow_name}' completed"
            }
        except Exception as e:
            return {
                "status": "failed",
                "error": str(e),
                "workflow": workflow_name,
                "message": f"❌ Workflow failed: {str(e)}"
            }
    
    # =========================================================================
    # Session Management
    # =========================================================================
    def reset_session(self) -> Dict[str, Any]:
        """Reset the session state for a new production."""
        self.session_state = SessionState()
        self.tools = MCPTools(comfy_service, self.session_state)
        
        return {
            "status": "success",
            "message": "🔄 Session reset. Ready for new production."
        }
    
    def get_production_summary(self) -> Dict[str, Any]:
        """Get a summary of the current production session."""
        history = self.session_state.render_history
        
        plates = [r for r in history if r.get("type") == "plate"]
        upscales = [r for r in history if r.get("type") == "upscale"]
        stitches = [r for r in history if r.get("type") == "stitch"]
        
        return {
            "total_renders": len(history),
            "plates_generated": len(plates),
            "upscales_performed": len(upscales),
            "stitches_performed": len(stitches),
            "credits_remaining": self.session_state.credits_remaining,
            "credits_used": 4200 - self.session_state.credits_remaining,
            "last_output": self.session_state.last_render_path,
            "environment_locked": self.session_state.environment_lock_image is not None
        }


# =========================================================================
# Global MCP Server Instance
# =========================================================================
mcp_server = MCPServer()
