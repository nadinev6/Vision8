#!/usr/bin/env python3
"""
Minimal Vision8 Backend Server - bypasses import issues
"""

import os
import sys
import uvicorn
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Simple settings
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", 8000))
API_DEBUG_MODE = os.getenv("API_DEBUG_MODE", "false").lower() == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# Create FastAPI app
app = FastAPI(
    title="Vision8 Backend API",
    description="Intelligent video processing and AI-powered scene generation",
    version="1.0.0",
    docs_url="/api/docs" if API_DEBUG_MODE else None,
    redoc_url="/api/redoc" if API_DEBUG_MODE else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Basic health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "message": "Vision8 Backend is running"
    }

@app.get("/")
async def root():
    return {
        "name": "Vision8 Backend API",
        "version": "1.0.0",
        "description": "Intelligent video processing and AI-powered scene generation",
        "status": "running"
    }

if __name__ == "__main__":
    print(f"🚀 Starting Vision8 Backend Server (Simple Mode)...")
    print(f"📍 Host: {API_HOST}")
    print(f"🔌 Port: {API_PORT}")
    print(f"🐛 Debug: {API_DEBUG_MODE}")
    print(f"🌐 API Docs: http://{API_HOST}:{API_PORT}/docs")
    
    if API_DEBUG_MODE:
        uvicorn.run(
            "simple_server:app",
            host=API_HOST,
            port=API_PORT,
            reload=True,
            log_level="info"
        )
    else:
        uvicorn.run(
            app,
            host=API_HOST,
            port=API_PORT,
            log_level="info"
        )