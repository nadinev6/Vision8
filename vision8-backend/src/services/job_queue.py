"""
Job Queue System for MCP Workflows
Supports parallel execution with dependency management
"""
import os
import asyncio
import uuid
import time
import structlog
from typing import Dict, Any, Optional, List, Union
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict, deque

logger = structlog.get_logger()

# =========================================================================
# Data Models
# =========================================================================
class JobStatus(Enum):
    """Job status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class WorkflowJob:
    """Represents a workflow job in the queue."""
    job_id: str
    tool_name: str
    parameters: Dict[str, Any]
    dependencies: List[str] = field(default_factory=list)
    priority: int = 5  # 1-10, higher = execute sooner
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    status: JobStatus = JobStatus.PENDING
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 2


@dataclass
class JobResult:
    """Result of a completed workflow job."""
    job_id: str
    status: JobStatus
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


# =========================================================================
# Job Queue Interface
# =========================================================================
class JobQueue:
    """Abstract job queue interface."""
    
    async def submit(self, job: WorkflowJob) -> str:
        """Submit a job to the queue. Returns job_id."""
        raise NotImplementedError
    
    async def get_status(self, job_id: str) -> JobStatus:
        """Get the status of a job."""
        raise NotImplementedError
    
    async def get_result(self, job_id: str) -> Optional[JobResult]:
        """Get the result of a completed job."""
        raise NotImplementedError
    
    async def list_pending(self, limit: int = 50) -> List[WorkflowJob]:
        """List pending jobs."""
        raise NotImplementedError
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending job."""
        raise NotImplementedError
    
    async def get_queue_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        raise NotImplementedError


# =========================================================================
# In-Memory Job Queue Implementation
# =========================================================================
class InMemoryJobQueue(JobQueue):
    """
    In-memory job queue implementation for single-instance deployment.
    Jobs are lost on restart but provides zero-configuration setup.
    """
    
    def __init__(self):
        self.jobs: Dict[str, WorkflowJob] = {}
        self.results: Dict[str, JobResult] = {}
        self.pending_queue: deque = deque()
        self.running_jobs: Dict[str, WorkflowJob] = {}
        self.dependency_graph: Dict[str, List[str]] = defaultdict(list)  # job_id -> dependencies
        self.reverse_dependencies: Dict[str, List[str]] = defaultdict(list)  # job_id -> dependent jobs
        self._lock = asyncio.Lock()
        self._executor_task: Optional[asyncio.Task] = None
        self._running = False
        
    async def start(self):
        """Start the job executor."""
        if not self._running:
            self._running = True
            self._executor_task = asyncio.create_task(self._job_executor())
            logger.info("Job queue executor started")
    
    async def stop(self):
        """Stop the job executor."""
        self._running = False
        if self._executor_task:
            self._executor_task.cancel()
            try:
                await self._executor_task
            except asyncio.CancelledError:
                pass
        logger.info("Job queue executor stopped")
    
    async def submit(self, job: WorkflowJob) -> str:
        """Submit a job to the queue."""
        async with self._lock:
            self.jobs[job.job_id] = job
            
            # Build dependency graph
            if job.dependencies:
                self.dependency_graph[job.job_id] = job.dependencies.copy()
                for dep_id in job.dependencies:
                    self.reverse_dependencies[dep_id].append(job.job_id)
            
            # Add to pending queue if no dependencies or all dependencies are completed
            if self._job_ready_to_run(job):
                self.pending_queue.append(job.job_id)
                # Re-sort queue by priority
                self._sort_pending_queue()
            
            logger.info("Job submitted", job_id=job.job_id, tool=job.tool_name, priority=job.priority)
            return job.job_id
    
    async def get_status(self, job_id: str) -> JobStatus:
        """Get the status of a job."""
        async with self._lock:
            job = self.jobs.get(job_id)
            return job.status if job else JobStatus.CANCELLED
    
    async def get_result(self, job_id: str) -> Optional[JobResult]:
        """Get the result of a completed job."""
        return self.results.get(job_id)
    
    async def list_pending(self, limit: int = 50) -> List[WorkflowJob]:
        """List pending jobs."""
        async with self._lock:
            pending_jobs = []
            for job_id in list(self.pending_queue)[:limit]:
                job = self.jobs.get(job_id)
                if job:
                    pending_jobs.append(job)
            return pending_jobs
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending job."""
        async with self._lock:
            job = self.jobs.get(job_id)
            if not job or job.status != JobStatus.PENDING:
                return False
            
            job.status = JobStatus.CANCELLED
            
            # Remove from pending queue
            try:
                self.pending_queue.remove(job_id)
            except ValueError:
                pass
            
            # Cancel any dependent jobs
            for dependent_id in self.reverse_dependencies[job_id]:
                dependent_job = self.jobs.get(dependent_id)
                if dependent_job and dependent_job.status == JobStatus.PENDING:
                    dependent_job.status = JobStatus.CANCELLED
            
            logger.info("Job cancelled", job_id=job_id)
            return True
    
    async def get_queue_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        async with self._lock:
            return {
                "pending_count": len(self.pending_queue),
                "running_count": len(self.running_jobs),
                "total_jobs": len(self.jobs),
                "completed_count": sum(1 for job in self.jobs.values() if job.status == JobStatus.COMPLETED),
                "failed_count": sum(1 for job in self.jobs.values() if job.status == JobStatus.FAILED),
                "cancelled_count": sum(1 for job in self.jobs.values() if job.status == JobStatus.CANCELLED)
            }
    
    def _job_ready_to_run(self, job: WorkflowJob) -> bool:
        """Check if a job is ready to run (all dependencies completed)."""
        if not job.dependencies:
            return True
        
        for dep_id in job.dependencies:
            dep_job = self.jobs.get(dep_id)
            if not dep_job or dep_job.status != JobStatus.COMPLETED:
                return False
        
        return True
    
    def _sort_pending_queue(self):
        """Sort pending queue by priority (higher priority first)."""
        sorted_jobs = sorted(
            [self.jobs[job_id] for job_id in self.pending_queue],
            key=lambda job: job.priority,
            reverse=True
        )
        self.pending_queue = deque([job.job_id for job in sorted_jobs])
    
    async def _job_executor(self):
        """Background task to execute jobs from the queue."""
        while self._running:
            try:
                await asyncio.sleep(0.1)  # Small delay to prevent busy waiting
                
                job_id = None
                async with self._lock:
                    if self.pending_queue:
                        job_id = self.pending_queue.popleft()
                        job = self.jobs.get(job_id)
                        if job and job.status == JobStatus.PENDING:
                            # Double-check dependencies
                            if not self._job_ready_to_run(job):
                                # Put back in queue and continue
                                self.pending_queue.append(job_id)
                                continue
                            
                            job.status = JobStatus.RUNNING
                            job.started_at = time.time()
                            self.running_jobs[job_id] = job
                
                if job_id:
                    await self._execute_job(job_id)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in job executor", error=str(e))
                await asyncio.sleep(1)  # Brief pause on error
    
    async def _execute_job(self, job_id: str):
        """Execute a single job."""
        job = self.jobs.get(job_id)
        if not job:
            return
        
        try:
            logger.info("Starting job execution", job_id=job_id, tool=job.tool_name)
            
            # Import MCP tools here to avoid circular imports
            from .mcp_tools import MCPTools
            from .mcp_server import mcp_server
            
            # Execute the MCP tool
            result = await mcp_server.execute_tool(job.tool_name, job.parameters)
            
            # Store result
            job.status = JobStatus.COMPLETED
            job.completed_at = time.time()
            job.result = result
            
            execution_time = job.completed_at - job.started_at
            
            self.results[job_id] = JobResult(
                job_id=job_id,
                status=JobStatus.COMPLETED,
                result=result,
                execution_time=execution_time,
                started_at=job.started_at,
                completed_at=job.completed_at
            )
            
            logger.info("Job completed successfully", 
                       job_id=job_id, 
                       tool=job.tool_name, 
                       execution_time=f"{execution_time:.2f}s")
            
            # Check if any dependent jobs can now run
            async with self._lock:
                if job_id in self.reverse_dependencies:
                    for dependent_id in self.reverse_dependencies[job_id]:
                        dependent_job = self.jobs.get(dependent_id)
                        if (dependent_job and 
                            dependent_job.status == JobStatus.PENDING and 
                            self._job_ready_to_run(dependent_job)):
                            self.pending_queue.append(dependent_id)
                            self._sort_pending_queue()
                
        except Exception as e:
            logger.error("Job execution failed", job_id=job_id, tool=job.tool_name, error=str(e))
            
            job.retry_count += 1
            if job.retry_count <= job.max_retries:
                # Retry the job
                job.status = JobStatus.PENDING
                job.started_at = None
                async with self._lock:
                    self.pending_queue.append(job_id)
                    self._sort_pending_queue()
                logger.info("Job will be retried", job_id=job_id, retry_count=job.retry_count)
            else:
                # Max retries reached, mark as failed
                job.status = JobStatus.FAILED
                job.completed_at = time.time()
                job.error = str(e)
                
                self.results[job_id] = JobResult(
                    job_id=job_id,
                    status=JobStatus.FAILED,
                    error=str(e),
                    started_at=job.started_at,
                    completed_at=job.completed_at
                )
        
        finally:
            async with self._lock:
                self.running_jobs.pop(job_id, None)


# =========================================================================
# Queue Factory
# =========================================================================
def create_job_queue() -> JobQueue:
    """Create appropriate job queue based on environment."""
    backend = os.getenv("QUEUE_BACKEND", "memory").lower()
    
    if backend == "memory":
        return InMemoryJobQueue()
    elif backend == "redis":
        # TODO: Implement Redis-backed queue
        logger.warning("Redis queue not implemented yet, falling back to memory queue")
        return InMemoryJobQueue()
    else:
        logger.warning(f"Unknown queue backend '{backend}', using memory queue")
        return InMemoryJobQueue()


# Global job queue instance
job_queue = create_job_queue()
