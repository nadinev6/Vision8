"""
Object Editing Service for Vision8

Integrates with existing object tracking to provide conversational and visual object editing
including removal, replacement, and enhancement using reference images.
"""
import os
import uuid
import structlog
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = structlog.get_logger()

# =========================================================================
# Data Models
# =========================================================================
class EditOperation(Enum):
    """Types of object editing operations."""
    REMOVE = "remove"
    REPLACE = "replace"
    ENHANCE = "enhance"
    MOVE = "move"
    RESIZE = "resize"
    RECOLOR = "recolor"


@dataclass
class BoundingBox:
    """Invisible bounding box for object tracking."""
    x: float
    y: float
    width: float
    height: float
    confidence: float
    track_id: str
    label: str


@dataclass
class ObjectEditRequest:
    """Request for object editing operations."""
    video_id: str
    scene_number: int
    object_label: str
    operation: EditOperation
    reference_image_url: Optional[str] = None
    new_properties: Optional[Dict[str, Any]] = None
    bounding_boxes: Optional[List[BoundingBox]] = None


@dataclass
class EditResult:
    """Result of object editing operation."""
    operation: EditOperation
    success: bool
    new_video_path: Optional[str] = None
    edited_scene_url: Optional[str] = None
    preview_url: Optional[str] = None
    confidence_score: Optional[float] = None
    error_message: Optional[str] = None


# =========================================================================
# Object Editing Service
# =========================================================================
class ObjectEditingService:
    """
    Service for conversational and visual object editing.
    
    Integrates with existing object tracking from Gemini analysis
    and provides editing capabilities through reference images.
    """
    
    def __init__(self):
        self.supported_operations = {op.value for op in EditOperation}
        
    async def analyze_object_from_text(
        self, 
        video_analysis: Dict[str, Any], 
        user_request: str
    ) -> List[ObjectEditRequest]:
        """
        Parse user text request to identify objects to edit.
        
        Args:
            video_analysis: Full video analysis with objects_tracked
            user_request: Natural language editing request
            
        Returns:
            List of edit requests based on analysis
        """
        try:
            # Extract objects from video analysis
            scenes = video_analysis.get("scenes", [])
            objects_by_label = {}
            
            # Collect all objects across scenes
            for scene in scenes:
                for obj in scene.get("objects_tracked", []):
                    label = obj.get("label", "unknown")
                    if label not in objects_by_label:
                        objects_by_label[label] = {
                            "label": label,
                            "track_id": obj.get("track_id"),
                            "confidence": obj.get("confidence", 0.5),
                            "scenes": []
                        }
                    
                    objects_by_label[label]["scenes"].append({
                        "scene_number": scene.get("scene_number"),
                        "start_time_ms": scene.get("start_time_ms"),
                        "end_time_ms": scene.get("end_time_ms"),
                        "boxes": obj.get("boxes", [])
                    })
            
            # Parse user request for objects and operations
            edit_requests = []
            
            # Simple keyword-based parsing (could be enhanced with NLP)
            request_lower = user_request.lower()
            
            # Identify operation
            operation = self._identify_operation(request_lower)
            
            # Identify objects mentioned
            mentioned_objects = self._identify_objects_in_text(request_lower, objects_by_label.keys())
            
            # Create edit requests for mentioned objects
            for obj_label in mentioned_objects:
                if obj_label in objects_by_label:
                    obj_data = objects_by_label[obj_label]
                    
                    # Get first occurrence for editing
                    first_scene = obj_data["scenes"][0] if obj_data["scenes"] else None
                    
                    if first_scene:
                        # Extract bounding boxes
                        boxes = []
                        for box_data in first_scene.get("boxes", []):
                            box = BoundingBox(
                                x=box_data.get("x", 0.0),
                                y=box_data.get("y", 0.0),
                                width=box_data.get("width", 0.1),
                                height=box_data.get("height", 0.1),
                                confidence=box_data.get("confidence", 0.8),
                                track_id=obj_data["track_id"],
                                label=obj_label
                            )
                            boxes.append(box)
                        
                        edit_request = ObjectEditRequest(
                            video_id=video_analysis.get("video_id", ""),
                            scene_number=first_scene["scene_number"],
                            object_label=obj_label,
                            operation=operation,
                            bounding_boxes=boxes
                        )
                        edit_requests.append(edit_request)
            
            logger.info("object_edit_requests_parsed", 
                       request=user_request,
                       objects_identified=len(edit_requests))
            
            return edit_requests
            
        except Exception as e:
            logger.error("object_analysis_failed", error=str(e), request=user_request)
            return []
    
    async def execute_object_edit(
        self, 
        edit_request: ObjectEditRequest,
        reference_image_url: Optional[str] = None
    ) -> EditResult:
        """
        Execute object editing operation using ComfyUI workflows.
        
        Args:
            edit_request: Edit operation to perform
            reference_image_url: Optional reference image for replacement
            
        Returns:
            Result of editing operation
        """
        try:
            logger.info("executing_object_edit", 
                       operation=edit_request.operation.value,
                       object_label=edit_request.object_label)
            
            # Import ComfyUI service
            from .comfy_mcp_service_enhanced import EnhancedComfyMCPService
            
            comfy_service = EnhancedComfyMCPService()
            
            # Select appropriate workflow based on operation
            workflow_name = self._get_workflow_for_operation(edit_request.operation)
            
            # Prepare inputs for ComfyUI
            inputs = self._prepare_workflow_inputs(edit_request, reference_image_url)
            
            # Execute workflow
            result_url = await comfy_service.run_workflow_with_resilience(workflow_name, inputs)
            
            # Create result
            edit_result = EditResult(
                operation=edit_request.operation,
                success=True,
                new_video_path=result_url,
                confidence_score=0.85  # Would be calculated based on actual results
            )
            
            logger.info("object_edit_completed", 
                       operation=edit_request.operation.value,
                       object_label=edit_request.object_label,
                       result_url=result_url)
            
            return edit_result
            
        except Exception as e:
            logger.error("object_edit_failed", 
                        operation=edit_request.operation.value,
                        object_label=edit_request.object_label,
                        error=str(e))
            
            return EditResult(
                operation=edit_request.operation,
                success=False,
                error_message=str(e)
            )
    
    async def generate_edit_suggestions(
        self, 
        video_analysis: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Generate intelligent editing suggestions based on video content.
        
        Args:
            video_analysis: Full video analysis
            
        Returns:
            List of suggested edits
        """
        suggestions = []
        scenes = video_analysis.get("scenes", [])
        
        # Analyze scenes for edit opportunities
        for scene in scenes:
            scene_number = scene.get("scene_number")
            
            # Suggest removing low-confidence objects
            for obj in scene.get("objects_tracked", []):
                if obj.get("confidence", 1.0) < 0.6:
                    suggestions.append({
                        "type": "remove",
                        "object_label": obj.get("label"),
                        "confidence": obj.get("confidence"),
                        "scene_number": scene_number,
                        "reasoning": f"Remove low-confidence object '{obj.get('label')}' (confidence: {obj.get('confidence', 0.0):.2f})",
                        "priority": "medium"
                    })
            
            # Suggest enhancements for prominent objects
            for obj in scene.get("objects_tracked", []):
                if obj.get("confidence", 0.0) > 0.8:
                    suggestions.append({
                        "type": "enhance",
                        "object_label": obj.get("label"),
                        "confidence": obj.get("confidence"),
                        "scene_number": scene_number,
                        "reasoning": f"Enhance high-confidence object '{obj.get('label')}' with better lighting/details",
                        "priority": "high"
                    })
        
        # Sort by priority
        priority_order = {"high": 3, "medium": 2, "low": 1}
        suggestions.sort(key=lambda x: priority_order.get(x["priority"], 0), reverse=True)
        
        logger.info("edit_suggestions_generated", count=len(suggestions))
        return suggestions
    
    def _identify_operation(self, request_text: str) -> EditOperation:
        """Identify editing operation from user request."""
        # Remove operation keywords
        remove_keywords = ["remove", "delete", "erase", "eliminate", "take out"]
        replace_keywords = ["replace", "swap", "change to", "substitute"]
        enhance_keywords = ["enhance", "improve", "better", "upgrade", "make better"]
        move_keywords = ["move", "relocate", "shift", "position"]
        resize_keywords = ["resize", "make bigger", "make smaller", "scale"]
        recolor_keywords = ["recolor", "change color", "recolorize", "modify color"]
        
        request_lower = request_text.lower()
        
        if any(keyword in request_lower for keyword in remove_keywords):
            return EditOperation.REMOVE
        elif any(keyword in request_lower for keyword in replace_keywords):
            return EditOperation.REPLACE
        elif any(keyword in request_lower for keyword in enhance_keywords):
            return EditOperation.ENHANCE
        elif any(keyword in request_lower for keyword in move_keywords):
            return EditOperation.MOVE
        elif any(keyword in request_lower for keyword in resize_keywords):
            return EditOperation.RESIZE
        elif any(keyword in request_lower for keyword in recolor_keywords):
            return EditOperation.RECOLOR
        else:
            # Default to enhancement
            return EditOperation.ENHANCE
    
    def _identify_objects_in_text(self, request_text: str, available_objects: List[str]) -> List[str]:
        """Identify which objects are mentioned in the request."""
        mentioned = []
        request_lower = request_text.lower()
        
        # Direct object mentions
        for obj_label in available_objects:
            if obj_label.lower() in request_lower:
                mentioned.append(obj_label)
        
        # Pronoun/object reference parsing
        if "it" in request_lower or "that" in request_lower or "this" in request_lower:
            # If pronouns are used, assume first/most prominent object
            if available_objects:
                mentioned.append(available_objects[0])
        
        # Generic object references
        if "object" in request_lower or "thing" in request_lower:
            # Could be enhanced to identify specific objects contextually
            pass
        
        return list(set(mentioned))  # Remove duplicates
    
    def _get_workflow_for_operation(self, operation: EditOperation) -> str:
        """Get appropriate ComfyUI workflow for the operation."""
        workflow_mapping = {
            EditOperation.REMOVE: "inpaint_remove_objects",
            EditOperation.REPLACE: "inpaint_replace_objects", 
            EditOperation.ENHANCE: "enhance_objects",
            EditOperation.MOVE: "move_objects",
            EditOperation.RESIZE: "resize_objects",
            EditOperation.RECOLOR: "recolor_objects"
        }
        
        return workflow_mapping.get(operation, "enhance_objects")
    
    def _prepare_workflow_inputs(
        self, 
        edit_request: ObjectEditRequest, 
        reference_image_url: Optional[str]
    ) -> Dict[str, Any]:
        """Prepare inputs for ComfyUI workflow execution."""
        inputs = {
            "SOURCE_VIDEO": f"video_{edit_request.video_id}.mp4",  # Would be actual path
            "SCENE_NUMBER": edit_request.scene_number,
            "OBJECT_LABEL": edit_request.object_label
        }
        
        # Add bounding boxes if available
        if edit_request.bounding_boxes:
            inputs["BOUNDING_BOXES"] = [
                {
                    "x": box.x,
                    "y": box.y, 
                    "width": box.width,
                    "height": box.height,
                    "track_id": box.track_id
                }
                for box in edit_request.bounding_boxes
            ]
        
        # Add reference image for replacement operations
        if (edit_request.operation == EditOperation.REPLACE or 
            edit_request.operation == EditOperation.ENHANCE):
            if reference_image_url:
                inputs["REFERENCE_IMAGE"] = reference_image_url
        
        return inputs


# Global object editing service instance
object_editing_service = ObjectEditingService()
