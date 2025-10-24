@echo off
REM Vision8 Backend Development Startup Script for Windows

echo 🚀 Starting Vision8 Backend in development mode...

REM Check if we're in the right directory
if not exist "src\main.py" (
    echo ❌ Error: Please run this script from the vision8-backend directory
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo 🔧 Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo 📚 Installing dependencies...
pip install -r requirements.txt

REM Set environment variables
set PYTHONPATH=%CD%\src
set API_DEBUG_MODE=true

REM Start the server
echo 🌟 Starting FastAPI server on http://localhost:8000
echo 📚 API Documentation: http://localhost:8000/api/docs
echo 🔍 Health Check: http://localhost:8000/health
echo.
echo Press Ctrl+C to stop the server

python src\main.py