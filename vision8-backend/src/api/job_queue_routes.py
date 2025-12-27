"""
Job Queue API Routes
Provides endpoints for batch execution and job status polling
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import structlog

from ..services.job_queue import job_queue, WorkflowJob, JobStatus
from ..services.mcp_server import mcp_server

logger = structlog.get_logger()
router = APIRouter(prefix="/api/mcp", tags=["MCP Job Queue"])

# =========================================================================
# Request/Response Models
# =========================================================================
class ToolExecutionRequest(BaseModel):
    """Request model for executing an MCP tool."""
    tool_name: str
    parameters: Dict[str, Any] = {}
    priority: int = 5  # 1-10, higher = execute sooner
    dependencies: List[str] = []


class BatchExecutionRequest(BaseModel):
    """Request model for batch tool execution."""
    jobs: List[ToolExecutionRequest]
    queue_parallel: bool = True


class JobStatusResponse(BaseModel):
    """Response model for job status."""
    job_id: str
    status: str
    tool_name: str
    created_at: Optional[float] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    progress: Optional[float] = None  # 0-100
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    retry_count: int = 0


class JobResultResponse(BaseModel):
    """Response model for job result."""
    job_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


# =========================================================================
# Dependency Injection
# =========================================================================
async def get_job_queue():
    """Get the global job queue instance."""
    return job_queue


# =========================================================================
# Batch Execution Endpoints
# =========================================================================
@router.post("/tools/execute-batch")
async def execute_batch_tools(
    request: BatchExecutionRequest,
    queue: job_queue = Depends(get_job_queue)
) -> Dict[str, Any]:
    """
    Submit multiple tools for parallel execution.
    
    If queue_parallel is True, jobs are submitted to the queue for async execution.
    If False, jobs are executed synchronously (blocking).
    """
    try:
        job_ids = []
        
        if request.queue_parallel:
            # Submit jobs to queue for async execution
            for job_request in request.jobs:
                job = WorkflowJob(
                    job_id=str(uuid.uuid4()),
                    tool_name=job_request.tool_name,
                    parameters=job_request.parameters,
                    dependencies=job_request.dependencies,
                    priority=job_request.priority
                )
                
                job_id = await queue.submit(job)
                job_ids.append(job_id)
            
            logger.info("Batch jobs submitted to queue", 
                       job_count=len(job_ids),
                       job_ids=job_ids)
            
            return {
                "status": "submitted",
                "job_ids": job_ids,
                "execution_mode": "queued",
                "message": f"{len(job_ids)} jobs submitted for execution"
            }
        else:
            # Execute jobs synchronously
            results = []
            for job_request in request.jobs:
                try:
                    result = await mcp_server.execute_tool(
                        job_request.tool_name, 
                        job_request.parameters
                    )
                    results.append({
                        "status": "completed",
                        "result": result
                    })
                except Exception as e:
                    results.append({
                        "status": "failed",
                        "error": str(e)
                    })
            
            logger.info("Batch jobs executed synchronously", 
                       job_count=len(results))
            
            return {
                "status": "completed",
                "results": results,
                "execution_mode": "synchronous"
            }
            
    except Exception as e:
        logger.error("Batch execution failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# Job Status Polling Endpoints
# =========================================================================
@router.get("/jobs/{job_id}/status")
async def get_job_status(
    job_id: str,
    queue: job_queue = Depends(get_job_queue)
) -> JobStatusResponse:
    """Poll job status without blocking."""
    try:
        job = queue.jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Calculate progress based on status
        progress = None
        if job.status == JobStatus.RUNNING and job.started_at:
            # Estimate progress based on time elapsed (rough approximation)
            import time
            elapsed = time.time() - job.started_at
            # Assume typical workflow takes 2-5 minutes, estimate 25% progress per minute
            progress = min(95.0, (elapsed / 120.0) * 100.0)
        elif job.status == JobStatus.COMPLETED:
            progress = 100.0
        
        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status.value,
            tool_name=job.tool_name,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            progress=progress,
            result=job.result,
            error=job.error,
            retry_count=job.retry_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get job status", job_id=job_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}/result")
async def get_job_result(
    job_id: str,
    queue: job_queue = Depends(get_job_queue)
) -> JobResultResponse:
    """Retrieve completed job result."""
    try:
        result = await queue.get_result(job_id)
        if not result:
            raise HTTPException(status_code=404, detail="Job result not found or job not completed")
        
        return JobResultResponse(
            job_id=result.job_id,
            status=result.status.value,
            result=result.result,
            error=result.error,
            execution_time=result.execution_time,
            started_at=result.started_at,
            completed_at=result.completed_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get job result", job_id=job_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/pending")
async def list_pending_jobs(
    limit: int = 50,
    queue: job_queue = Depends(get_job_queue)
) -> Dict[str, Any]:
    """List pending jobs in the queue."""
    try:
        pending_jobs = await queue.list_pending(limit)
        
        return {
            "status": "success",
            "jobs": [
                {
                    "job_id": job.job_id,
                    "tool_name": job.tool_name,
                    "priority": job.priority,
                    "created_at": job.created_at,
                    "dependencies": job.dependencies
                }
                for job in pending_jobs
            ],
            "count": len(pending_jobs)
        }
        
    except Exception as e:
        logger.error("Failed to list pending jobs", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    queue: job_queue = Depends(get_job_queue)
) -> Dict[str, Any]:
    """Cancel a pending job."""
    try:
        cancelled = await queue.cancel_job(job_id)
        
        if not cancelled:
            raise HTTPException(status_code=400, detail="Job cannot be cancelled (not found or not pending)")
        
        logger.info("Job cancelled", job_id=job_id)
        
        return {
            "status": "success",
            "job_id": job_id,
            "message": "Job cancelled successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to cancel job", job_id=job_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queue/stats")
async def get_queue_stats(
    queue: job_queue = Depends(get_job_queue)
) -> Dict[str, Any]:
    """Get queue statistics."""
    try:
        stats = await queue.get_queue_stats()
        
        return {
            "status": "success",
            "stats": stats
        }
        
    except Exception as e:
        logger.error("Failed to get queue stats", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# Workflow Suggestion Endpoints
# =========================================================================
@router.get("/suggestions")
async def get_workflow_suggestions(
    session_id: str,
    mcp_server_instance = Depends(lambda: mcp_server)
) -> Dict[str, Any]:
    """
    Get auto-suggested next tools based on current session state.
    
    This endpoint analyzes the session state and suggests the next logical
    tools in the workflow based on dependency graph.
    """
    try:
        # Get session context from MCP server
        session_context = mcp_server_instance.tools.get_session_context()
        
        # Generate suggestions based on current state
        suggestions = _generate_workflow_suggestions(session_context)
        
        return {
            "status": "success",
            "session_id": session_id,
            "suggestions": suggestions,
            "current_state": session_context
        }
        
    except Exception as e:
        logger.error("Failed to get workflow suggestions", session_id=session_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


def _generate_workflow_suggestions(session_context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generate workflow suggestions based on session context."""
    suggestions = []
    
    # Get current state
    last_render_path = session_context.get("last_render_path")
    last_plate_resolution = session_context.get("last_plate_resolution")
    render_count = session_context.get("render_count", 0)
    
    # Suggest based on what's been done
    if not last_render_path:
        # No previous renders - suggest starting with preview
        suggestions.append({
            "tool": "generatePreview",
            "description": "Generate a low-res preview to test your prompt",
            "priority": "high",
            "reasoning": "Start with a preview to validate your concept before committing to full quality"
        })
        
        suggestions.append({
            "tool": "generatePlate",
            "description": "Generate a full quality video plate",
            "priority": "medium",
            "reasoning": "Directly generate full quality if you're confident in your prompt"
        })
    
    elif "720p" in last_plate_resolution or "480p" in last_plate_resolution:
        # Last render was a preview - suggest upscale
        suggestions.append({
            "tool": "upscaleExisting",
            "description": "Upscale the preview to 4K quality",
            "priority": "high",
            "reasoning": "Upgrade your preview to production quality"
        })
        
        suggestions.append({
            "tool": "generatePlate",
            "description": "Generate a new full quality version",
            "priority": "medium",
            "reasoning": "Generate a fresh full quality version if the preview needs improvement"
        })
    
    elif render_count > 0:
        # Has previous renders - suggest advanced options
        suggestions.append({
            "tool": "stitchVideos",
            "description": "Combine with other video segments",
            "priority": "medium",
            "reasoning": "Ready to combine multiple clips into a final sequence"
        })
        
        suggestions.append({
            "tool": "replaceVideoBackground",
            "description": "Replace background with generated environment",
            "priority": "low",
            "reasoning": "Enhance the video with AI-generated backgrounds"
        })
    
    return suggestions


# =========================================================================
# Health Check
# =========================================================================
@router.get("/queue/health")
async def queue_health_check(
    queue: job_queue = Depends(get_job_queue)
) -> Dict[str, Any]:
    """Health check for job queue service."""
    try:
        stats = await queue.get_queue_stats()
        
        # Check if queue executor is running
        executor_running = queue._running if hasattr(queue, '_running') else True
        
        return {
            "status": "healthy" if executor_running else "unhealthy",
            "service": "job_queue",
            "executor_running": executor_running,
            "stats": stats
        }
        
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "job_queue",
            "error": str(e)
        }
