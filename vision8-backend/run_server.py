#!/usr/bin/env python3
"""
Vision8 Backend Server Startup Script

This script properly sets up the Python path and starts the FastAPI server.
"""

import os
import sys
from pathlib import Path

# Add the src directory to Python path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(src_dir))

# Now import and run the main application
if __name__ == "__main__":
    try:
        from main import app
        import uvicorn
        
        # Get settings
        host = os.getenv("API_HOST", "0.0.0.0")
        port = int(os.getenv("API_PORT", 8000))
        debug = os.getenv("API_DEBUG_MODE", "false").lower() == "true"
        
        print(f"🚀 Starting Vision8 Backend Server...")
        print(f"📍 Host: {host}")
        print(f"🔌 Port: {port}")
        print(f"🐛 Debug: {debug}")
        print(f"🌐 API Docs: http://{host}:{port}/docs")
        
        # Start the server
        if debug:
            # Use string import for reload mode
            uvicorn.run(
                "main:app",
                host=host,
                port=port,
                reload=True,
                log_level="debug"
            )
        else:
            # Use app object for production
            uvicorn.run(
                app,
                host=host,
                port=port,
                log_level="info"
            )
        
    except ImportError as e:
        print(f"❌ Import Error: {e}")
        print("💡 Make sure all required dependencies are installed:")
        print("   pip install fastapi uvicorn python-dotenv")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        sys.exit(1)