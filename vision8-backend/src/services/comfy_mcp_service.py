
import os
import json
import uuid
import asyncio
import httpx
import websockets
import structlog
from typing import Dict, Any, Optional, List

logger = structlog.get_logger()

class ComfyMCPService:
    """
    Robust ComfyUI Client Service for Vision8.
    Acting as a bridge for MCP-like tool interactions.
    """
    
    def __init__(self, server_address: str = None):
        self.server_address = server_address or os.getenv("COMFY_URL", "127.0.0.1:8188")
        self.client_id = str(uuid.uuid4())
        self.http_url = f"http://{self.server_address}"
        self.ws_url = f"ws://{self.server_address}/ws?clientId={self.client_id}"
        
    def _find_node_by_title(self, workflow: Dict[str, Any], title: str) -> Optional[str]:
        """Dynamically find a node ID by its _meta.title."""
        for node_id, node in workflow.items():
            if node.get('_meta', {}).get('title') == title:
                return node_id
        return None

    async def upload_file(self, file_path: str, filename: str) -> str:
        """Upload an asset to ComfyUI /upload/image (handles videos too)."""
        logger.info("Uploading asset to ComfyUI", path=file_path, filename=filename)
        
        async with httpx.AsyncClient() as client:
            with open(file_path, "rb") as f:
                files = {"image": (filename, f)}
                response = await client.post(f"{self.http_url}/upload/image", files=files)
                response.raise_for_status()
                return response.json()["name"]

    async def queue_prompt(self, workflow: Dict[str, Any]) -> str:
        """Queue a workflow prompt and return the prompt_id."""
        logger.info("Queueing ComfyUI prompt")
        
        payload = {
            "prompt": workflow,
            "client_id": self.client_id
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{self.http_url}/prompt", json=payload)
            response.raise_for_status()
            return response.json()["prompt_id"]

    async def track_progress(self, prompt_id: str):
        """Track real-time progress via WebSocket."""
        logger.info("Tracking progress via WebSocket", prompt_id=prompt_id)
        
        async with websockets.connect(self.ws_url) as websocket:
            while True:
                out = await websocket.recv()
                if isinstance(out, str):
                    message = json.loads(out)
                    
                    if message["type"] == "executing":
                        data = message["data"]
                        if data["node"] is None and data["prompt_id"] == prompt_id:
                            logger.info("Execution complete", prompt_id=prompt_id)
                            break
                        else:
                            logger.debug("Executing node", node=data["node"])
                            
                    elif message["type"] == "progress":
                        data = message["data"]
                        if data["prompt_id"] == prompt_id:
                            progress = (data["value"] / data["max"]) * 100
                            logger.info("Progress update", progress=f"{progress:.1f}%")
                            
                    elif message["type"] == "status":
                        logger.debug("Status update", status=message["data"]["status"])
                else:
                    # Binary data (previews) - could be handled later
                    continue

    async def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """Fetch final output metadata from ComfyUI history."""
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.http_url}/history/{prompt_id}")
            response.raise_for_status()
            return response.json().get(prompt_id, {})

    async def run_workflow(self, workflow_name: str, inputs: Dict[str, Any]) -> str:
        """
        Main entry point to execute a workflow.
        Handles dynamic node injection, upload (local or remote), and status tracking.
        """
        logger.info("Starting ComfyUI workflow execution", workflow=workflow_name)
        
        # 1. Load workflow JSON
        workflow_path = os.getenv("COMFY_WORKFLOWS_DIR", "./workflows")
        full_path = os.path.join(workflow_path, f"{workflow_name}.json")
        
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Workflow {workflow_name} not found at {full_path}")
            
        with open(full_path, "r") as f:
            workflow = json.load(f)
            
        # 2. Handle Asset Uploads/Injections
        for title, val in inputs.items():
            node_id = self._find_node_by_title(workflow, title)
            if not node_id:
                logger.warning(f"Node with title '{title}' not found in workflow. Skipping.")
                continue
                
            # Handle local file paths
            if isinstance(val, str) and os.path.exists(val) and ("SOURCE" in title or "IMAGE" in title or "VIDEO" in title):
                filename = os.path.basename(val)
                remote_name = await self.upload_file(val, filename)
                val = remote_name # Replace path with remote name for injection

            # Handle URL inputs (for chaining)
            elif isinstance(val, str) and val.startswith("http"):
                 if self.http_url in val:
                     # It's already on this ComfyUI server, just extract the filename
                     from urllib.parse import urlparse, parse_qs
                     parsed = urlparse(val)
                     filename = parse_qs(parsed.query).get('filename', [None])[0]
                     if filename:
                         val = filename
                 else:
                     # External URL - in a robust implementation, we'd download it first
                     # For now, we assume it's either local or already on Comfy
                     pass

            # Inject into node
            target_field = 'video' if 'video' in workflow[node_id]['inputs'] else \
                           'image' if 'image' in workflow[node_id]['inputs'] else \
                           'text' if 'text' in workflow[node_id]['inputs'] else \
                           list(workflow[node_id]['inputs'].keys())[0]
            
            workflow[node_id]['inputs'][target_field] = val

        # 3. Queue the prompt
        prompt_id = await self.queue_prompt(workflow)
        
        # 4. Track progress via WS
        await self.track_progress(prompt_id)
        
        # 5. Fetch result from history
        history = await self.get_history(prompt_id)
        
        # 6. Extract output video/image URL
        # Assuming the 'OUTPUT' node contains a filename
        output_node_id = self._find_node_by_title(workflow, "OUTPUT_NODE")
        if not output_node_id:
            # Fallback to searching for nodes that have output results in history
            outputs = history.get("outputs", {})
            for nid, node_output in outputs.items():
                 if 'videos' in node_output or 'images' in node_output:
                     output_node_id = nid
                     break
        
        if output_node_id and output_node_id in history.get("outputs", {}):
            node_output = history["outputs"][output_node_id]
            if "videos" in node_output:
                filename = node_output["videos"][0]["filename"]
                return f"{self.http_url}/view?filename={filename}&type=output"
            elif "images" in node_output:
                 filename = node_output["images"][0]["filename"]
                 return f"{self.http_url}/view?filename={filename}&type=output"
                 
        return "Workflow completed but output could not be determined."

# Global instance
comfy_service = ComfyMCPService()
