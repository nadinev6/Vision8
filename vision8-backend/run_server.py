#!/usr/bin/env python3
"""
Vision8 Backend Server Startup Script

This script properly sets up the Python path and starts the FastAPI server.
"""

import os
import sys
from pathlib import Path

# Add both the current directory and src directory to Python path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
sys.path.insert(0, str(current_dir))
sys.path.insert(0, str(src_dir))

# Change to src directory for relative imports to work
os.chdir(src_dir)

# Now import and run the main application
if __name__ == "__main__":
    try:
        from main import main
        
        print(f"🚀 Starting Vision8 Backend Server...")
        print(f"📍 Working directory: {os.getcwd()}")
        
        # Run the main function which handles uvicorn startup
        main()
        
    except ImportError as e:
        print(f"❌ Import Error: {e}")
        print("💡 Make sure all required dependencies are installed:")
        print("   pip install fastapi uvicorn python-dotenv")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        sys.exit(1)