"""
Graph Mutator for Dynamic Node Injection

Enables dynamic modification of ComfyUI workflow graphs by:
- Injecting new nodes (ControlNet, IC-Light, etc.)
- Rewiring connections automatically
- Suggesting enhancements based on prompt analysis
"""

from typing import Dict, Any, List, Optional, Tuple
import structlog
import re

from .node_library import NodeLibrary

logger = structlog.get_logger()


class GraphMutator:
    """
    Dynamic graph modification engine.
    Injects nodes into existing workflows and rewires connections.
    """
    
    def __init__(self):
        self.node_library = NodeLibrary
    
    def _get_next_id(self, graph: Dict[str, Any]) -> int:
        """Get the next available node ID."""
        if not graph:
            return 1
        return max(int(k) for k in graph.keys()) + 1
    
    def _find_node_by_type(self, graph: Dict[str, Any], class_type: str) -> Optional[str]:
        """Find a node by its class_type."""
        for node_id, node in graph.items():
            if node.get("class_type") == class_type:
                return node_id
        return None
    
    def _find_node_by_title(self, graph: Dict[str, Any], title_pattern: str) -> Optional[str]:
        """Find a node by title pattern."""
        for node_id, node in graph.items():
            title = node.get("_meta", {}).get("title", "")
            if title_pattern.lower() in title.lower():
                return node_id
        return None
    
    def _find_output_node(self, graph: Dict[str, Any]) -> Optional[str]:
        """Find the output node (VIDEO_COMBINE or SAVE_IMAGE)."""
        for node_id, node in graph.items():
            title = node.get("_meta", {}).get("title", "")
            if "OUTPUT" in title.upper() or node.get("class_type") in ["VHS_VideoCombine", "SaveImage"]:
                return node_id
        return None
    
    def _find_connections_to_node(self, graph: Dict[str, Any], target_id: str) -> List[Tuple[str, str]]:
        """Find all nodes that have connections pointing to target_id."""
        connections = []
        for node_id, node in graph.items():
            inputs = node.get("inputs", {})
            for input_name, input_value in inputs.items():
                if isinstance(input_value, list) and len(input_value) >= 1:
                    if input_value[0] == target_id:
                        connections.append((node_id, input_name))
        return connections
    
    def _rewire_connections(
        self, 
        graph: Dict[str, Any], 
        old_source: str, 
        new_source: str,
        output_index: int = 0
    ) -> Dict[str, Any]:
        """Rewire all connections from old_source to new_source."""
        for node_id, node in graph.items():
            inputs = node.get("inputs", {})
            for input_name, input_value in inputs.items():
                if isinstance(input_value, list) and len(input_value) >= 1:
                    if input_value[0] == old_source:
                        graph[node_id]["inputs"][input_name] = [new_source, output_index]
        return graph
    
    # =========================================================================
    # Node Injection Methods
    # =========================================================================
    def inject_node(
        self, 
        graph: Dict[str, Any], 
        node_type: str, 
        position: str = "before_output",
        params: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Dynamically inject a node into an existing graph.
        
        Args:
            graph: The workflow graph to modify
            node_type: Type of node to inject (e.g., "DepthControlNet", "ICLight")
            position: Where to inject ("before_output", "after_sampler", etc.)
            params: Parameters for the new node
            
        Returns:
            Modified graph with new node injected
        """
        params = params or {}
        new_id = self._get_next_id(graph)
        
        logger.info("Injecting node", node_type=node_type, position=position, new_id=new_id)
        
        if node_type == "DepthControlNet":
            return self._inject_depth_controlnet(graph, new_id, params)
        elif node_type == "CannyControlNet":
            return self._inject_canny_controlnet(graph, new_id, params)
        elif node_type == "ICLight":
            return self._inject_ic_light(graph, new_id, params)
        elif node_type == "ColorGrade":
            return self._inject_color_grade(graph, new_id, params)
        elif node_type == "IPAdapter":
            return self._inject_ip_adapter(graph, new_id, params)
        else:
            logger.warning("Unknown node type for injection", node_type=node_type)
            return graph
    
    def _inject_depth_controlnet(
        self, 
        graph: Dict[str, Any], 
        new_id: int, 
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Inject DepthControlNet before the sampler."""
        # Find the sampler
        sampler_id = self._find_node_by_type(graph, "Wan22Sampler") or \
                     self._find_node_by_type(graph, "KSampler")
        
        if not sampler_id:
            logger.warning("No sampler found, cannot inject DepthControlNet")
            return graph
        
        # Find the positive conditioning input to sampler
        sampler_inputs = graph[sampler_id].get("inputs", {})
        positive_ref = sampler_inputs.get("positive", [])
        
        # Add ControlNet loader
        loader_id = str(new_id)
        graph[loader_id] = self.node_library.controlnet_loader(
            params.get("controlnet_name", "control_v11f1p_sd15_depth.safetensors"),
            new_id
        )
        new_id += 1
        
        # Find an image source (use first LoadImage node)
        image_id = self._find_node_by_type(graph, "LoadImage")
        if not image_id:
            logger.warning("No image source for ControlNet")
            return graph
        
        # Add ControlNet Apply node
        controlnet_id = str(new_id)
        graph[controlnet_id] = {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "control_net": [loader_id, 0],
                "image": [image_id, 0],
                "positive": positive_ref,
                "negative": sampler_inputs.get("negative", []),
                "strength": params.get("strength", 0.8),
                "start_percent": 0.0,
                "end_percent": 1.0
            },
            "_meta": {"title": f"DepthControlNet_{new_id}"}
        }
        
        # Rewire sampler to use ControlNet output
        graph[sampler_id]["inputs"]["positive"] = [controlnet_id, 0]
        graph[sampler_id]["inputs"]["negative"] = [controlnet_id, 1]
        
        return graph
    
    def _inject_canny_controlnet(
        self, 
        graph: Dict[str, Any], 
        new_id: int, 
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Inject CannyControlNet for edge preservation."""
        # Similar to depth, but with canny preprocessor
        sampler_id = self._find_node_by_type(graph, "Wan22Sampler") or \
                     self._find_node_by_type(graph, "KSampler")
        
        if not sampler_id:
            logger.warning("No sampler found, cannot inject CannyControlNet")
            return graph
        
        sampler_inputs = graph[sampler_id].get("inputs", {})
        positive_ref = sampler_inputs.get("positive", [])
        
        # Add Canny preprocessor
        canny_id = str(new_id)
        image_id = self._find_node_by_type(graph, "LoadImage")
        graph[canny_id] = {
            "class_type": "Canny",
            "inputs": {
                "image": [image_id, 0] if image_id else [],
                "low_threshold": params.get("low_threshold", 100),
                "high_threshold": params.get("high_threshold", 200)
            },
            "_meta": {"title": f"CannyPreprocess_{new_id}"}
        }
        new_id += 1
        
        # Add ControlNet loader
        loader_id = str(new_id)
        graph[loader_id] = self.node_library.controlnet_loader(
            "control_v11p_sd15_canny.safetensors",
            new_id
        )
        new_id += 1
        
        # Add ControlNet Apply
        controlnet_id = str(new_id)
        graph[controlnet_id] = {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "control_net": [loader_id, 0],
                "image": [canny_id, 0],
                "positive": positive_ref,
                "negative": sampler_inputs.get("negative", []),
                "strength": params.get("strength", 0.7),
                "start_percent": 0.0,
                "end_percent": 1.0
            },
            "_meta": {"title": f"CannyControlNet_{new_id}"}
        }
        
        # Rewire sampler
        graph[sampler_id]["inputs"]["positive"] = [controlnet_id, 0]
        graph[sampler_id]["inputs"]["negative"] = [controlnet_id, 1]
        
        return graph
    
    def _inject_ic_light(
        self, 
        graph: Dict[str, Any], 
        new_id: int, 
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Inject IC-Light for dynamic relighting."""
        # Find foreground and environment references
        foreground_ref = params.get("foreground", [])
        environment_ref = params.get("environment", [])
        
        if not foreground_ref:
            # Try to find a video/image source
            fg_id = self._find_node_by_title(graph, "Foreground") or \
                    self._find_node_by_type(graph, "VHS_LoadVideo")
            if fg_id:
                foreground_ref = [fg_id, 0]
        
        if not environment_ref:
            # Look for environment image
            env_id = self._find_node_by_title(graph, "Environment") or \
                     self._find_node_by_title(graph, "LoadImage")
            if env_id:
                environment_ref = [env_id, 0]
        
        if not foreground_ref or not environment_ref:
            logger.warning("Cannot inject IC-Light: missing foreground or environment")
            return graph
        
        # Add IC-Light node
        iclight_id = str(new_id)
        graph[iclight_id] = self.node_library.ic_light(
            foreground_ref,
            environment_ref,
            new_id,
            intensity=params.get("intensity", 1.0),
            color_transfer=params.get("color_transfer", 0.5)
        )
        
        # Find composite node and rewire
        composite_id = self._find_node_by_type(graph, "CompositeVideoOnBackground")
        if composite_id:
            graph[composite_id]["inputs"]["foreground"] = [iclight_id, 0]
        
        return graph
    
    def _inject_color_grade(
        self, 
        graph: Dict[str, Any], 
        new_id: int, 
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Inject color grading before output."""
        output_id = self._find_output_node(graph)
        if not output_id:
            logger.warning("No output node found for color grade injection")
            return graph
        
        # Find what's connected to output
        output_inputs = graph[output_id].get("inputs", {})
        image_ref = output_inputs.get("images", [])
        
        if not image_ref:
            return graph
        
        # Add color grade node
        grade_id = str(new_id)
        graph[grade_id] = self.node_library.color_grade(
            image_ref,
            new_id,
            preset=params.get("preset", "cinematic"),
            contrast=params.get("contrast", 1.1),
            saturation=params.get("saturation", 1.0)
        )
        
        # Rewire output to use graded images
        graph[output_id]["inputs"]["images"] = [grade_id, 0]
        
        return graph
    
    def _inject_ip_adapter(
        self, 
        graph: Dict[str, Any], 
        new_id: int, 
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Inject IP-Adapter for style consistency."""
        # Find checkpoint and sampler
        checkpoint_id = self._find_node_by_type(graph, "CheckpointLoaderSimple")
        sampler_id = self._find_node_by_type(graph, "Wan22Sampler") or \
                     self._find_node_by_type(graph, "KSampler")
        
        if not checkpoint_id or not sampler_id:
            logger.warning("Cannot inject IP-Adapter: missing checkpoint or sampler")
            return graph
        
        # Need a style reference image
        style_image = params.get("style_image")
        if not style_image:
            logger.warning("No style_image provided for IP-Adapter")
            return graph
        
        # Load style image
        style_img_id = str(new_id)
        graph[style_img_id] = self.node_library.load_image(style_image, new_id)
        new_id += 1
        
        # Load IP-Adapter model
        ipa_loader_id = str(new_id)
        graph[ipa_loader_id] = self.node_library.ip_adapter_loader(
            params.get("ipadapter_file", "ip-adapter-plus_sd15.bin"),
            new_id
        )
        new_id += 1
        
        # Apply IP-Adapter
        ipa_id = str(new_id)
        graph[ipa_id] = self.node_library.ip_adapter(
            [checkpoint_id, 0],
            [ipa_loader_id, 0],
            [style_img_id, 0],
            new_id,
            weight=params.get("weight", 0.7)
        )
        
        # Rewire sampler to use IP-Adapter model output
        graph[sampler_id]["inputs"]["model"] = [ipa_id, 0]
        
        return graph
    
    # =========================================================================
    # Enhancement Suggestion Engine
    # =========================================================================
    def suggest_enhancements(self, prompt: str, job_type: str = "i2v") -> List[Tuple[str, Dict[str, Any]]]:
        """
        Analyze prompt and suggest nodes to inject.
        
        Returns list of (node_type, params) tuples.
        """
        suggestions = []
        prompt_lower = prompt.lower()
        
        # Depth/3D suggestions
        if any(word in prompt_lower for word in ["depth", "3d", "dimensional", "perspective"]):
            suggestions.append(("DepthControlNet", {"strength": 0.7}))
        
        # Edge/line preservation
        if any(word in prompt_lower for word in ["sharp", "edge", "line", "architectural"]):
            suggestions.append(("CannyControlNet", {"strength": 0.6}))
        
        # Lighting suggestions
        if any(word in prompt_lower for word in ["volumetric", "lighting", "lit", "shadows", "dramatic"]):
            suggestions.append(("ICLight", {"intensity": 0.8}))
        
        # Cinematic look
        if any(word in prompt_lower for word in ["cinematic", "film", "movie", "hollywood", "color grade"]):
            suggestions.append(("ColorGrade", {"preset": "cinematic", "contrast": 1.15}))
        
        # Style consistency
        if any(word in prompt_lower for word in ["consistent", "match", "style", "same look"]):
            suggestions.append(("IPAdapter", {"weight": 0.7}))
        
        logger.info("Enhancement suggestions", count=len(suggestions), suggestions=[s[0] for s in suggestions])
        
        return suggestions
    
    def auto_enhance(
        self, 
        graph: Dict[str, Any], 
        prompt: str, 
        job_type: str = "i2v"
    ) -> Dict[str, Any]:
        """
        Automatically apply suggested enhancements to a graph.
        """
        suggestions = self.suggest_enhancements(prompt, job_type)
        
        for node_type, params in suggestions:
            graph = self.inject_node(graph, node_type, params=params)
        
        return graph


# Global instance
graph_mutator = GraphMutator()
