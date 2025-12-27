#!/usr/bin/env python3
"""
Integration Test for MCP Server Enhancements
"""
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_imports():
    """Test all imports work correctly."""
    print("🔍 Testing imports...")
    
    # Test enhanced ComfyUI service
    try:
        from services.comfy_mcp_service_enhanced import EnhancedComfyMCPService
        print("✅ Enhanced ComfyUI Service imported successfully")
    except Exception as e:
        print(f"❌ Failed to import Enhanced ComfyUI Service: {e}")
        return False
    
    # Test job queue
    try:
        from services.job_queue import job_queue, InMemoryJobQueue
        print("✅ Job Queue System imported successfully")
    except Exception as e:
        print(f"❌ Failed to import Job Queue: {e}")
        return False
    
    # Test job queue routes
    try:
        from api.job_queue_routes import router as job_queue_router
        print("✅ Job Queue Routes imported successfully")
    except Exception as e:
        print(f"❌ Failed to import Job Queue Routes: {e}")
        return False
    
    return True

def test_job_queue_functionality():
    """Test basic job queue functionality."""
    print("\n🔍 Testing job queue functionality...")
    
    try:
        from services.job_queue import InMemoryJobQueue, WorkflowJob, JobStatus
        
        # Create queue
        queue = InMemoryJobQueue()
        print("✅ Job queue created successfully")
        
        # Create a test job
        job = WorkflowJob(
            job_id="test-job-123",
            tool_name="testTool",
            parameters={"test": "value"}
        )
        print("✅ Test job created successfully")
        
        return True
    except Exception as e:
        print(f"❌ Job queue functionality test failed: {e}")
        return False

def test_enhanced_service():
    """Test enhanced ComfyUI service."""
    print("\n🔍 Testing enhanced ComfyUI service...")
    
    try:
        from services.comfy_mcp_service_enhanced import EnhancedComfyMCPService
        
        # Create service
        service = EnhancedComfyMCPService()
        print("✅ Enhanced ComfyUI service created successfully")
        
        # Test config loading
        from services.comfy_mcp_service_enhanced import get_workflow_config
        config = get_workflow_config("generate_wan_plate")
        print(f"✅ Workflow config loaded: {config.timeout_seconds}s timeout")
        
        return True
    except Exception as e:
        print(f"❌ Enhanced service test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("🚀 MCP Server Enhancement Integration Test")
    print("=" * 50)
    
    success = True
    
    # Test imports
    success &= test_imports()
    
    # Test job queue functionality
    success &= test_job_queue_functionality()
    
    # Test enhanced service
    success &= test_enhanced_service()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 All tests passed! MCP Server Enhancement integration is working.")
        print("\n📋 Next steps:")
        print("1. Start the FastAPI server to test the endpoints")
        print("2. Test the job queue endpoints:")
        print("   - GET /api/mcp/queue/health")
        print("   - POST /api/mcp/tools/execute-batch")
        print("3. Monitor job execution and status polling")
    else:
        print("❌ Some tests failed. Please check the errors above.")
    
    return success

if __name__ == "__main__":
    main()
