"""
Enhanced ComfyUI MCP Service with Timeout, Retry, and Circuit Breaker
"""
import os
import json
import uuid
import asyncio
import httpx
import websockets
import structlog
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager
from functools import wraps
import time
from dataclasses import dataclass
from enum import Enum

logger = structlog.get_logger()

# =========================================================================
# Configuration & Constants
# =========================================================================
class WorkflowType(Enum):
    """Workflow types for timeout and retry configuration."""
    GENERATE_WAN_PLATE = "generate_wan_plate"
    HERO_SCENE = "hero_scene"
    UPSCALE_VIDEO = "upscale_video"
    LIPSYNC = "lipsync"
    BACKGROUND_REPLACE = "background_replace"
    ENVIRONMENT_GENERATION = "environment_generation"
    I2V_FROM_ENVIRONMENT = "i2v_from_environment"
    CUSTOM_WORKFLOW = "custom_workflow"


@dataclass
class WorkflowConfig:
    """Configuration for workflow timeout and retry behavior."""
    timeout_seconds: int
    max_attempts: int
    base_delay: float
    max_delay: float
    retry_on_timeout: bool = True
    retry_on_overloaded: bool = True


# Default timeout configurations (can be overridden via environment variables)
DEFAULT_WORKFLOW_CONFIGS = {
    WorkflowType.GENERATE_WAN_PLATE: WorkflowConfig(300, 3, 2.0, 10.0),  # 5 minutes
    WorkflowType.HERO_SCENE: WorkflowConfig(300, 3, 2.0, 10.0),         # 5 minutes
    WorkflowType.UPSCALE_VIDEO: WorkflowConfig(480, 3, 3.0, 15.0),       # 8 minutes
    WorkflowType.LIPSYNC: WorkflowConfig(180, 2, 2.0, 8.0),             # 3 minutes
    WorkflowType.BACKGROUND_REPLACE: WorkflowConfig(600, 2, 5.0, 20.0),  # 10 minutes
    WorkflowType.ENVIRONMENT_GENERATION: WorkflowConfig(120, 3, 1.0, 5.0), # 2 minutes
    WorkflowType.I2V_FROM_ENVIRONMENT: WorkflowConfig(240, 2, 2.0, 10.0), # 4 minutes
    WorkflowType.CUSTOM_WORKFLOW: WorkflowConfig(600, 2, 3.0, 15.0),     # 10 minutes
}


def load_workflow_configs() -> Dict[WorkflowType, WorkflowConfig]:
    """Load workflow configurations from environment variables."""
    configs = DEFAULT_WORKFLOW_CONFIGS.copy()
    
    # Override with environment variables if present
    env_mappings = {
        "COMFYUI_GENERATE_TIMEOUT": WorkflowType.GENERATE_WAN_PLATE,
        "COMFYUI_HERO_SCENE_TIMEOUT": WorkflowType.HERO_SCENE,
        "COMFYUI_UPSCALE_TIMEOUT": WorkflowType.UPSCALE_VIDEO,
        "COMFYUI_LIPSYNC_TIMEOUT": WorkflowType.LIPSYNC,
        "COMFYUI_BACKGROUND_REPLACE_TIMEOUT": WorkflowType.BACKGROUND_REPLACE,
        "COMFYUI_ENVIRONMENT_TIMEOUT": WorkflowType.ENVIRONMENT_GENERATION,
        "COMFYUI_I2V_TIMEOUT": WorkflowType.I2V_FROM_ENVIRONMENT,
        "COMFYUI_CUSTOM_TIMEOUT": WorkflowType.CUSTOM_WORKFLOW,
    }
    
    for env_var, workflow_type in env_mappings.items():
        if env_var in os.environ:
            try:
                timeout = int(os.getenv(env_var))
                configs[workflow_type].timeout_seconds = timeout
            except ValueError:
                logger.warning(f"Invalid timeout value in {env_var}, using default")
    
    return configs


WORKFLOW_CONFIGS = load_workflow_configs()

# Global circuit breaker state
_CIRCUIT_BREAKER_STATE = {
    "failure_count": 0,
    "last_failure_time": 0,
    "state": "closed",  # closed, open, half_open
    "failure_threshold": 5,
    "recovery_timeout": 60  # seconds
}


# =========================================================================
# Utility Functions
# =========================================================================
def get_workflow_config(workflow_name: str) -> WorkflowConfig:
    """Get configuration for a specific workflow."""
    try:
        workflow_type = WorkflowType(workflow_name)
        return WORKFLOW_CONFIGS.get(workflow_type, WORKFLOW_CONFIGS[WorkflowType.CUSTOM_WORKFLOW])
    except ValueError:
        return WORKFLOW_CONFIGS[WorkflowType.CUSTOM_WORKFLOW]


def exponential_backoff(attempt: int, base_delay: float, max_delay: float) -> float:
    """Calculate exponential backoff delay."""
    delay = base_delay * (2 ** attempt)
    return min(delay, max_delay)


def update_circuit_breaker(failure: bool):
    """Update circuit breaker state based on operation result."""
    global _CIRCUIT_BREAKER_STATE
    
    current_time = time.time()
    
    if failure:
        _CIRCUIT_BREAKER_STATE["failure_count"] += 1
        _CIRCUIT_BREAKER_STATE["last_failure_time"] = current_time
        
        if (_CIRCUIT_BREAKER_STATE["failure_count"] >= 
            _CIRCUIT_BREAKER_STATE["failure_threshold"]):
            _CIRCUIT_BREAKER_STATE["state"] = "open"
            logger.warning("Circuit breaker opened due to consecutive failures")
    else:
        # Reset on success
        _CIRCUIT_BREAKER_STATE["failure_count"] = 0
        _CIRCUIT_BREAKER_STATE["state"] = "closed"
        logger.debug("Circuit breaker reset on success")


def check_circuit_breaker() -> bool:
    """Check if circuit breaker allows operation."""
    global _CIRCUIT_BREAKER_STATE
    
    if _CIRCUIT_BREAKER_STATE["state"] == "closed":
        return True
    
    if _CIRCUIT_BREAKER_STATE["state"] == "open":
        current_time = time.time()
        if (current_time - _CIRCUIT_BREAKER_STATE["last_failure_time"] > 
            _CIRCUIT_BREAKER_STATE["recovery_timeout"]):
            _CIRCUIT_BREAKER_STATE["state"] = "half_open"
            logger.info("Circuit breaker moved to half-open state")
            return True
        return False
    
    # half_open state - allow one attempt
    return True


# =========================================================================
# Decorators and Context Managers
# =========================================================================
def retry_with_backoff(max_attempts: int = 3, base_delay: float = 2.0, max_delay: float = 10.0):
    """Decorator for retrying async functions with exponential backoff."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except (asyncio.TimeoutError, httpx.TimeoutException) as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        delay = exponential_backoff(attempt, base_delay, max_delay)
                        logger.warning(f"Attempt {attempt + 1} failed, retrying in {delay:.1f}s", 
                                     error=str(e))
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logger.error(f"All {max_attempts} attempts failed", error=str(e))
                        update_circuit_breaker(failure=True)
                        raise
                except (httpx.ConnectError, httpx.RemoteProtocolError) as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        delay = exponential_backoff(attempt, base_delay, max_delay)
                        logger.warning(f"Connection failed, retrying in {delay:.1f}s", error=str(e))
                        await asyncio.sleep(delay)
                        continue
                    else:
                        logger.error(f"Connection failed after {max_attempts} attempts", error=str(e))
                        update_circuit_breaker(failure=True)
                        raise
                except Exception as e:
                    # Don't retry on other exceptions (like invalid parameters)
                    logger.error(f"Non-retryable error: {str(e)}")
                    update_circuit_breaker(failure=True)
                    raise
            
            # This should not be reached, but just in case
            if last_exception:
                raise last_exception
        
        return wrapper
    return decorator


@asynccontextmanager
async def timeout_wrapper(timeout_seconds: int, workflow_name: str = "unknown"):
    """Context manager for workflow execution with timeout."""
    logger.debug(f"Starting workflow '{workflow_name}' with {timeout_seconds}s timeout")
    
    try:
        async with asyncio.timeout(timeout_seconds):
            yield
    except asyncio.TimeoutError:
        logger.error(f"Workflow '{workflow_name}' timed out after {timeout_seconds} seconds")
        update_circuit_breaker(failure=True)
        raise TimeoutError(f"Workflow '{workflow_name}' timed out after {timeout_seconds} seconds")


class EnhancedComfyMCPService:
    """
    Enhanced ComfyUI Client Service for Vision8 with resilience features.
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

    @retry_with_backoff(max_attempts=3, base_delay=2.0, max_delay=8.0)
    async def upload_file(self, file_path: str, filename: str) -> str:
        """Upload an asset to ComfyUI /upload/image (handles videos too) with retry."""
        logger.info("Uploading asset to ComfyUI", path=file_path, filename=filename)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            with open(file_path, "rb") as f:
                files = {"image": (filename, f)}
                response = await client.post(f"{self.http_url}/upload/image", files=files)
                response.raise_for_status()
                return response.json()["name"]

    @retry_with_backoff(max_attempts=3, base_delay=1.0, max_delay=5.0)
    async def queue_prompt(self, workflow: Dict[str, Any]) -> str:
        """Queue a workflow prompt and return the prompt_id with retry."""
        logger.info("Queueing ComfyUI prompt")
        
        payload = {
            "prompt": workflow,
            "client_id": self.client_id
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(f"{self.http_url}/prompt", json=payload)
            response.raise_for_status()
            return response.json()["prompt_id"]

    async def track_progress_with_timeout(self, prompt_id: str, timeout_seconds: int = 600):
        """Track real-time progress via WebSocket with timeout."""
        logger.info("Tracking progress via WebSocket", prompt_id=prompt_id)
        
        try:
            async with timeout_wrapper(timeout_seconds, f"progress_tracking_{prompt_id}"):
                async with websockets.connect(self.ws_url) as websocket:
                    while True:
                        try:
                            # Add timeout to websocket recv to prevent indefinite blocking
                            out = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                        except asyncio.TimeoutError:
                            logger.warning("WebSocket recv timeout, checking if job is still running")
                            # Continue waiting for the job to complete
                            continue
                            
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
                            
        except asyncio.TimeoutError:
            logger.warning(f"Progress tracking timed out after {timeout_seconds} seconds", prompt_id=prompt_id)
            raise TimeoutError(f"Progress tracking timed out for prompt {prompt_id}")
        except Exception as e:
            logger.error("Error in progress tracking", prompt_id=prompt_id, error=str(e))
            raise

    @retry_with_backoff(max_attempts=3, base_delay=1.0, max_delay=5.0)
    async def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """Fetch final output metadata from ComfyUI history with retry."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{self.http_url}/history/{prompt_id}")
            response.raise_for_status()
            return response.json().get(prompt_id, {})

    async def run_workflow_with_resilience(self, workflow_name: str, inputs: Dict[str, Any]) -> str:
        """
        Main entry point to execute a workflow with timeout and retry logic.
        """
        # Check circuit breaker before starting
        if not check_circuit_breaker():
            raise Exception("Circuit breaker is open. ComfyUI service is temporarily unavailable.")
        
        # Get workflow configuration
        config = get_workflow_config(workflow_name)
        
        logger.info("Starting ComfyUI workflow execution with resilience", 
                   workflow=workflow_name, timeout=config.timeout_seconds)
        
        last_exception = None
        
        # Retry loop
        for attempt in range(config.max_attempts):
            try:
                # Use timeout wrapper for the entire workflow execution
                async with timeout_wrapper(config.timeout_seconds, workflow_name):
                    return await self._execute_workflow_internal(workflow_name, inputs)
                    
            except (asyncio.TimeoutError, httpx.TimeoutException) as e:
                last_exception = e
                if attempt < config.max_attempts - 1:
                    delay = exponential_backoff(attempt, config.base_delay, config.max_delay)
                    logger.warning(f"Workflow attempt {attempt + 1} timed out, retrying in {delay:.1f}s", 
                                 workflow=workflow_name, error=str(e))
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"All {config.max_attempts} attempts failed for workflow {workflow_name}", 
                               error=str(e))
                    update_circuit_breaker(failure=True)
                    
                    # Provide user-friendly fallback message
                    if workflow_name in ["generate_wan_plate", "hero_scene"]:
                        raise Exception(f"Video generation timed out after {config.timeout_seconds}s. "
                                      f"This might be due to high server load. Try generating a preview first.")
                    else:
                        raise Exception(f"Workflow {workflow_name} timed out after {config.timeout_seconds}s. "
                                      f"Please try again later.")
                        
            except (httpx.ConnectError, httpx.RemoteProtocolError) as e:
                last_exception = e
                if attempt < config.max_attempts - 1:
                    delay = exponential_backoff(attempt, config.base_delay, config.max_delay)
                    logger.warning(f"Connection failed, retrying in {delay:.1f}s", error=str(e))
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"Connection failed after {config.max_attempts} attempts", error=str(e))
                    update_circuit_breaker(failure=True)
                    raise Exception(f"Cannot connect to ComfyUI server. Please check server status.")
                    
            except Exception as e:
                # Don't retry on other exceptions (like invalid parameters, file not found, etc.)
                logger.error(f"Non-retryable error in workflow {workflow_name}: {str(e)}")
                update_circuit_breaker(failure=True)
                raise
        
        # This should not be reached, but just in case
        if last_exception:
            raise last_exception
        else:
            raise Exception("Unknown error occurred during workflow execution")

    async def _execute_workflow_internal(self, workflow_name: str, inputs: Dict[str, Any]) -> str:
        """Internal workflow execution without retry logic."""
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

            # Inject
