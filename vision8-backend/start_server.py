#!/usr/bin/env python3
"""
Simple server startup script that avoids import issues
"""

import os
import sys
import uvicorn
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

if __name__ == "__main__":
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    # Get settings
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", 8000))
    debug = os.getenv("API_DEBUG_MODE", "false").lower() == "true"
    
    print(f"🚀 Starting Vision8 Backend Server...")
    print(f"📍 Host: {host}")
    print(f"🔌 Port: {port}")
    print(f"🐛 Debug: {debug}")
    
    # Start uvicorn directly with the module path
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=debug,
        log_level="info",
        app_dir=str(src_path)
    )