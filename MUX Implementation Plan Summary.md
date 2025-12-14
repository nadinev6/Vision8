Vision8 + Mux Integration Specification
Executive Summary
Vision8 is an AI-powered video analysis and generation platform with a conversational interface. This document outlines the integration plan for Mux video infrastructure and fal.ai for cost-effective AI video generation.

Current Stack
- Frontend: React + TypeScript + Tailwind CSS
- Backend: FastAPI + Python
- AI: Google Gemini Flash (multimodal analysis)
- Search: Supabase + pgvector (semantic/vector search)
- Storage: Firebase Storage
- Analysis Cost: $0.000375/min (16x cheaper than OpenAI + Whisper)

Integration Goals
- Replace video players with Mux Player (keep custom overlays)
- Add Mux analytics to Analysis Panel
- Enable cost-effective scene replacement via fal.ai
- Add live streaming capability (future)

┌────────┬────────────────────────────────────────┬────────────────────────┐
│        │                                        │                        │
│ HISTORY│     DUAL VIDEO PLAYERS                 │    ANALYSIS PANEL      │
│ SIDEBAR│  ┌─────────────┐ ┌─────────────┐      │  ┌──────────────────┐  │
│        │  │  ORIGINAL   │ │  GENERATED  │      │  │Scenes│Trans│Obj │  │
│ 📹 Vid1│  │   VIDEO     │ │   VIDEO     │      │  └──────────────────┘  │
│ 📹 Vid2│  └─────────────┘ └─────────────┘      │                        │
│ 📹 Vid3│                                        │  Scene descriptions    │
│ 📹 Vid4│  ┌────────────────────────────────┐   │  with clickable        │
│        │  │       CHAT INTERFACE           │   │  timestamps            │
│        │  │                                │   │                        │
│        │  │  User: "Find cats"             │   │  Transcript with       │
│        │  │  AI: "Found 3 scenes [0:15]    │   │  speaker IDs           │
│        │  │       [0:45] [1:23]"           │   │                        │
│        │  │                                │   │  Object detection      │
│        │  └────────────────────────────────┘   │  with bounding boxes   │
│        │                                        │                        │
│        │  ┌────────────────────────────────┐   │                        │
│        │  │[Analyze][📷][✨] Input...  [➤]│   │                        │
│        │  └────────────────────────────────┘   │                        │
└────────┴────────────────────────────────────────┴────────────────────────┘

Existing Features
- Side-by-side video comparison (Original vs AI-Generated)
- Conversational AI assistant for search and commands
- Scene descriptions with clickable timestamp citations
- Transcript with speaker identification
- Object detection with bounding boxes for negative prompting
- Semantic/vector search + filters
- History thread of past video analyses

Phase 1: Mux Player Integration
Goal
Replace current HTML5 video players with Mux Player while preserving custom overlay features (frame controls, sync indicators, annotations).

Files to Create/Modify

src/components/video/
├── DualPlayerContainer.tsx    ← Modify: Wrap with Mux
├── MuxVideoPlayer.tsx         ← Create: Mux wrapper component
├── PlayerOverlays/
│   ├── FrameController.tsx    ← Keep: Custom frame controls
│   ├── SyncIndicators.tsx     ← Keep: Audio/video sync display
│   └── SceneMarkers.tsx       ← Keep: Clickable scene highlights

Implementation
MuxVideoPlayer.tsx

DualPlayerContainer.tsx

Phase 2: Analytics Tab
Goal
Add a 4th tab "Analytics" to the Analysis Panel showing Mux video performance data.

Files to Create/Modify

src/components/analysis/
├── AnalysisPanel.tsx          ← Modify: Add 4th tab
├── tabs/
│   ├── ScenesTab.tsx          ← Existing
│   ├── TranscriptTab.tsx      ← Existing
│   ├── ObjectsTab.tsx         ← Existing
│   └── AnalyticsTab.tsx       ← Create: New tab

Implementation
AnalysisPanel.tsx (Modified)
tabs/AnalyticsTab.tsx (New File)

Phase 3: Scene Replacement with Cost Options
Goal
Enhance chat citations with scene replacement options (Remove, Budget, Premium).

Scene Replacement Strategy
Option	Model		Cost	Use Case
Remove	Mux Clip API	Free	Cut scene entirely
Budget	SDXL + Effects	$0.025	Static replacement with Ken Burns
Premium	flux via fal.ai	$0.40	Full motion video

Files to Create/Modify
src/components/chat/
├── ChatMessage.tsx            ← Modify: Add replacement options
├── SceneCitation.tsx          ← Modify: Add action buttons
├── ReplacementOptions.tsx     ← Create: Cost selection UI
├── CostComparison.tsx         ← Create: Total cost display

src/services/
├── fal/
│   ├── falClient.ts           ← Create: fal.ai API client
│   └── sceneGenerator.ts      ← Create: Generation logic
├── mux/
│   ├── clipService.ts         ← Create: Mux Clip API
│   └── uploadService.ts       ← Create: Direct upload

Implementation
SceneCitation.tsx (Enhanced)

services/fal/sceneGenerator.ts

services/mux/clipService.ts

Phase 4: Live Streaming (Future)
Goal
Add "Go Live" capability with real-time AI analysis.

UI Addition
// Add to input bar
<button 
  className="live-btn flex items-center gap-1 px-3 py-2 
             bg-red-500 text-white rounded hover:bg-red-600"
  onClick={handleStartLive}
>
  🔴 Go Live
</button>

Backend API Endpoints
New FastAPI Routes

# app/api/mux.py

from fastapi import APIRouter, HTTPException
from app.services.mux_service import MuxService
from app.services.fal_service import FalService

router = APIRouter(prefix="/api/mux", tags=["mux"])
mux_service = MuxService()
fal_service = FalService()

@router.post("/webhook")
async def handle_webhook(data: dict):
    """Handle Mux webhook events"""
    event_type = data.get("type")
    
    if event_type == "video.asset.ready":
        asset_id = data["data"]["id"]
        # Trigger AI analysis
        await trigger_analysis(asset_id)
        
    elif event_type == "video.asset.errored":
        # Handle error
        pass
        
    return {"status": "received"}


@router.get("/analytics/{asset_id}")
async def get_analytics(asset_id: str):
    """Fetch Mux analytics for a video"""
    try:
        analytics = await mux_service.get_analytics(asset_id)
        return analytics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/url")
async def get_upload_url():
    """Get direct upload URL for browser uploads"""
    upload = await mux_service.create_direct_upload()
    return {
        "upload_url": upload.url,
        "asset_id": upload.asset_id
    }


@router.post("/scenes/replace")
async def replace_scene(request: SceneReplacementRequest):
    """Replace a scene with AI-generated content"""
    
    if request.option == "remove":
        result = await mux_service.remove_scene(
            request.asset_id,
            request.start_time,
            request.end_time
        )
    elif request.option == "budget":
        # Generate with SDXL
        generated = await fal_service.generate_sdxl(request.prompt)
        result = await mux_service.replace_scene(
            request.asset_id,
            request.start_time,
            request.end_time,
            generated.url
        )
    elif request.option == "premium":
        # Generate with flux
        generated = await fal_service.generate_flux(request.prompt)
        result = await mux_service.replace_scene(
            request.asset_id,
            request.start_time,
            request.end_time,
            generated.url
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid option")
    
    return result


@router.post("/live/start")
async def start_live_stream():
    """Create a new live stream"""
    stream = await mux_service.create_live_stream()
    return {
        "stream_id": stream.id,
        "rtmp_url": stream.rtmp_url,
        "playback_id": stream.playback_id
    }


Implementation Priority
Phase	Task				Effort		Impact		Priority
1	Mux Player integration		Medium		High		Week 1
2	Analytics tab			Low		High		Week 1-2
3	Scene replacement UI		Medium		Very High	Week 2-3
3	fal.ai integration		Medium		Very High	Week 2-3
3	Mux Clip API			Medium		High		Week 2-3
4	Live streaming			Low		Minimal 	Post-competition

