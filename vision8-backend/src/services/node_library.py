"""
Node Library for Dynamic ComfyUI Workflow Construction

Defines the "DNA" of each ComfyUI node - their inputs, outputs, class types,
and connection points. This enables programmatic graph construction without templates.
"""

from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass
from enum import Enum


class NodeType(Enum):
    """Supported ComfyUI node types."""
    # Input Nodes
    LOAD_IMAGE = "LoadImage"
    LOAD_VIDEO = "VHS_LoadVideo"
    
    # Segmentation
    SAM2_VIDEO_SEGMENTATION = "SAM2VideoSegmentation"
    VIDEO_MASK_PROPAGATOR = "VideoMaskPropagator"
    
    # Lighting & Effects
    IC_LIGHT = "ICLight"
    DEPTH_CONTROLNET = "ControlNetApplyAdvanced"
    CANNY_CONTROLNET = "ControlNetApplyAdvanced"
    COLOR_GRADE = "ColorGrade"
    
    # Video Generation
    WAN22_SAMPLER = "Wan22Sampler"
    WAN22_I2V_LATENT = "Wan22ImageToVideoLatent"
    
    # Compositing
    COMPOSITE_VIDEO = "CompositeVideoOnBackground"
    
    # Encoding/Decoding
    CLIP_TEXT_ENCODE = "CLIPTextEncode"
    VAE_ENCODE = "VAEEncode"
    VAE_DECODE = "VAEDecode"
    
    # Loaders
    CHECKPOINT_LOADER = "CheckpointLoaderSimple"
    CONTROLNET_LOADER = "ControlNetLoader"
    IP_ADAPTER_LOADER = "IPAdapterModelLoader"
    
    # Utilities
    IP_ADAPTER = "IPAdapter"
    EMPTY_LATENT_VIDEO = "EmptyLatentVideo"
    
    # Output
    VIDEO_COMBINE = "VHS_VideoCombine"
    SAVE_IMAGE = "SaveImage"


@dataclass
class NodeConnection:
    """Represents a connection between nodes."""
    source_node_id: str
    source_output_index: int = 0


class NodeLibrary:
    """
    Library of ComfyUI node definitions for dynamic graph construction.
    Each method returns a node dictionary ready for JSON serialization.
    """
    
    # =========================================================================
    # Input Nodes
    # =========================================================================
    @staticmethod
    def load_image(image_path: str, node_id: int) -> Dict[str, Any]:
        """Load an image file."""
        return {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_path
            },
            "_meta": {"title": f"LoadImage_{node_id}"}
        }
    
    @staticmethod
    def load_video(
        video_path: str, 
        node_id: int,
        force_rate: int = 24,
        force_size: str = "Disabled",
        custom_width: int = 1280,
        custom_height: int = 720
    ) -> Dict[str, Any]:
        """Load a video file."""
        return {
            "class_type": "VHS_LoadVideo",
            "inputs": {
                "video": video_path,
                "force_rate": force_rate,
                "force_size": force_size,
                "custom_width": custom_width,
                "custom_height": custom_height
            },
            "_meta": {"title": f"LoadVideo_{node_id}"}
        }
    
    # =========================================================================
    # Segmentation Nodes (SAM2 + Mask Propagator)
    # =========================================================================
    @staticmethod
    def sam2_video_segmentation(
        video_input: Union[NodeConnection, List],
        node_id: int,
        detection_hint: str = "person",
        confidence_threshold: float = 0.8
    ) -> Dict[str, Any]:
        """
        SAM2/3 Video Segmentation for temporal stability.
        Segments first frame and prepares for mask propagation.
        """
        input_ref = [video_input.source_node_id, video_input.source_output_index] if isinstance(video_input, NodeConnection) else video_input
        
        return {
            "class_type": "SAM2VideoSegmentation",
            "inputs": {
                "video": input_ref,
                "detection_hint": detection_hint,
                "confidence_threshold": confidence_threshold,
                "output_mask": True,
                "temporal_consistency": True
            },
            "_meta": {"title": f"SAM2Segment_{node_id}"}
        }
    
    @staticmethod
    def video_mask_propagator(
        first_frame_mask: Union[NodeConnection, List],
        video_input: Union[NodeConnection, List],
        node_id: int,
        propagation_mode: str = "bidirectional",
        smoothing: float = 0.3
    ) -> Dict[str, Any]:
        """
        Video Mask Propagator (Track-Anything style).
        Carries mask through 125+ frames for stable edges.
        """
        mask_ref = [first_frame_mask.source_node_id, first_frame_mask.source_output_index] if isinstance(first_frame_mask, NodeConnection) else first_frame_mask
        video_ref = [video_input.source_node_id, video_input.source_output_index] if isinstance(video_input, NodeConnection) else video_input
        
        return {
            "class_type": "VideoMaskPropagator",
            "inputs": {
                "mask": mask_ref,
                "video": video_ref,
                "propagation_mode": propagation_mode,
                "temporal_smoothing": smoothing,
                "edge_refinement": True
            },
            "_meta": {"title": f"MaskPropagator_{node_id}"}
        }
    
    # =========================================================================
    # Lighting & Effects Nodes
    # =========================================================================
    @staticmethod
    def ic_light(
        foreground: Union[NodeConnection, List],
        environment_image: Union[NodeConnection, List],
        node_id: int,
        intensity: float = 1.0,
        color_transfer: float = 0.5
    ) -> Dict[str, Any]:
        """
        IC-Light (Imposing Consistent Light).
        Re-lights foreground subject to match environment lighting.
        """
        fg_ref = [foreground.source_node_id, foreground.source_output_index] if isinstance(foreground, NodeConnection) else foreground
        env_ref = [environment_image.source_node_id, environment_image.source_output_index] if isinstance(environment_image, NodeConnection) else environment_image
        
        return {
            "class_type": "ICLight",
            "inputs": {
                "foreground": fg_ref,
                "light_reference": env_ref,
                "intensity": intensity,
                "color_transfer": color_transfer,
                "preserve_skin_tones": True,
                "shadow_direction": "auto"
            },
            "_meta": {"title": f"ICLight_{node_id}"}
        }
    
    @staticmethod
    def depth_controlnet(
        control_image: Union[NodeConnection, List],
        conditioning: Union[NodeConnection, List],
        node_id: int,
        strength: float = 0.8,
        start_percent: float = 0.0,
        end_percent: float = 1.0
    ) -> Dict[str, Any]:
        """Depth ControlNet for 3D depth preservation."""
        img_ref = [control_image.source_node_id, control_image.source_output_index] if isinstance(control_image, NodeConnection) else control_image
        cond_ref = [conditioning.source_node_id, conditioning.source_output_index] if isinstance(conditioning, NodeConnection) else conditioning
        
        return {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "control_net": ["controlnet_loader", 0],
                "image": img_ref,
                "positive": cond_ref,
                "strength": strength,
                "start_percent": start_percent,
                "end_percent": end_percent
            },
            "_meta": {"title": f"DepthControlNet_{node_id}"}
        }
    
    @staticmethod
    def canny_controlnet(
        control_image: Union[NodeConnection, List],
        conditioning: Union[NodeConnection, List],
        node_id: int,
        strength: float = 0.7,
        low_threshold: float = 100,
        high_threshold: float = 200
    ) -> Dict[str, Any]:
        """Canny ControlNet for edge preservation."""
        img_ref = [control_image.source_node_id, control_image.source_output_index] if isinstance(control_image, NodeConnection) else control_image
        cond_ref = [conditioning.source_node_id, conditioning.source_output_index] if isinstance(conditioning, NodeConnection) else conditioning
        
        return {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "control_net": ["canny_controlnet_loader", 0],
                "image": img_ref,
                "positive": cond_ref,
                "strength": strength,
                "low_threshold": low_threshold,
                "high_threshold": high_threshold
            },
            "_meta": {"title": f"CannyControlNet_{node_id}"}
        }
    
    @staticmethod
    def color_grade(
        image: Union[NodeConnection, List],
        node_id: int,
        preset: str = "cinematic",
        contrast: float = 1.1,
        saturation: float = 1.0,
        temperature: float = 0.0
    ) -> Dict[str, Any]:
        """Color grading for cinematic look."""
        img_ref = [image.source_node_id, image.source_output_index] if isinstance(image, NodeConnection) else image
        
        return {
            "class_type": "ColorGrade",
            "inputs": {
                "image": img_ref,
                "preset": preset,
                "contrast": contrast,
                "saturation": saturation,
                "temperature": temperature
            },
            "_meta": {"title": f"ColorGrade_{node_id}"}
        }
    
    # =========================================================================
    # Video Generation Nodes (Wan 2.2)
    # =========================================================================
    @staticmethod
    def wan22_i2v_latent(
        image_input: Union[NodeConnection, List],
        node_id: int,
        num_frames: int = 120,
        motion_bucket_id: int = 127
    ) -> Dict[str, Any]:
        """Wan 2.2 Image-to-Video latent calculation."""
        img_ref = [image_input.source_node_id, image_input.source_output_index] if isinstance(image_input, NodeConnection) else image_input
        
        return {
            "class_type": "Wan22ImageToVideoLatent",
            "inputs": {
                "image": img_ref,
                "num_frames": num_frames,
                "motion_bucket_id": motion_bucket_id
            },
            "_meta": {"title": f"Wan22I2VLatent_{node_id}"}
        }
    
    @staticmethod
    def wan22_sampler(
        model: Union[NodeConnection, List],
        positive: Union[NodeConnection, List],
        negative: Union[NodeConnection, List],
        latent: Union[NodeConnection, List],
        node_id: int,
        seed: int = 42,
        steps: int = 20,
        cfg: float = 7.5,
        denoise: float = 1.0
    ) -> Dict[str, Any]:
        """Wan 2.2 video sampler (14B MoE)."""
        model_ref = [model.source_node_id, model.source_output_index] if isinstance(model, NodeConnection) else model
        pos_ref = [positive.source_node_id, positive.source_output_index] if isinstance(positive, NodeConnection) else positive
        neg_ref = [negative.source_node_id, negative.source_output_index] if isinstance(negative, NodeConnection) else negative
        lat_ref = [latent.source_node_id, latent.source_output_index] if isinstance(latent, NodeConnection) else latent
        
        return {
            "class_type": "Wan22Sampler",
            "inputs": {
                "model": model_ref,
                "positive": pos_ref,
                "negative": neg_ref,
                "latent_image": lat_ref,
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "denoise": denoise
            },
            "_meta": {"title": f"Wan22Sampler_{node_id}"}
        }
    
    # =========================================================================
    # Compositing Nodes
    # =========================================================================
    @staticmethod
    def composite_video_on_background(
        foreground: Union[NodeConnection, List],
        background: Union[NodeConnection, List],
        mask: Union[NodeConnection, List],
        node_id: int,
        blend_mode: str = "normal",
        feather: float = 2.0
    ) -> Dict[str, Any]:
        """Composite foreground video onto new background."""
        fg_ref = [foreground.source_node_id, foreground.source_output_index] if isinstance(foreground, NodeConnection) else foreground
        bg_ref = [background.source_node_id, background.source_output_index] if isinstance(background, NodeConnection) else background
        mask_ref = [mask.source_node_id, mask.source_output_index] if isinstance(mask, NodeConnection) else mask
        
        return {
            "class_type": "CompositeVideoOnBackground",
            "inputs": {
                "foreground": fg_ref,
                "background": bg_ref,
                "mask": mask_ref,
                "blend_mode": blend_mode,
                "feather_amount": feather
            },
            "_meta": {"title": f"Composite_{node_id}"}
        }
    
    # =========================================================================
    # Text Encoding
    # =========================================================================
    @staticmethod
    def clip_text_encode(
        clip: Union[NodeConnection, List],
        text: str,
        node_id: int
    ) -> Dict[str, Any]:
        """CLIP text encoding for conditioning."""
        clip_ref = [clip.source_node_id, clip.source_output_index] if isinstance(clip, NodeConnection) else clip
        
        return {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": clip_ref,
                "text": text
            },
            "_meta": {"title": f"CLIPEncode_{node_id}"}
        }
    
    # =========================================================================
    # Loaders
    # =========================================================================
    @staticmethod
    def checkpoint_loader(
        ckpt_name: str,
        node_id: int
    ) -> Dict[str, Any]:
        """Load model checkpoint."""
        return {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": ckpt_name
            },
            "_meta": {"title": f"CheckpointLoader_{node_id}"}
        }
    
    @staticmethod
    def controlnet_loader(
        controlnet_name: str,
        node_id: int
    ) -> Dict[str, Any]:
        """Load ControlNet model."""
        return {
            "class_type": "ControlNetLoader",
            "inputs": {
                "control_net_name": controlnet_name
            },
            "_meta": {"title": f"ControlNetLoader_{node_id}"}
        }
    
    @staticmethod
    def ip_adapter_loader(
        ipadapter_file: str,
        node_id: int
    ) -> Dict[str, Any]:
        """Load IP-Adapter model."""
        return {
            "class_type": "IPAdapterModelLoader",
            "inputs": {
                "ipadapter_file": ipadapter_file
            },
            "_meta": {"title": f"IPAdapterLoader_{node_id}"}
        }
    
    # =========================================================================
    # IP-Adapter
    # =========================================================================
    @staticmethod
    def ip_adapter(
        model: Union[NodeConnection, List],
        ipadapter: Union[NodeConnection, List],
        image: Union[NodeConnection, List],
        node_id: int,
        weight: float = 0.7,
        noise: float = 0.0
    ) -> Dict[str, Any]:
        """Apply IP-Adapter for style/environment lock."""
        model_ref = [model.source_node_id, model.source_output_index] if isinstance(model, NodeConnection) else model
        ipa_ref = [ipadapter.source_node_id, ipadapter.source_output_index] if isinstance(ipadapter, NodeConnection) else ipadapter
        img_ref = [image.source_node_id, image.source_output_index] if isinstance(image, NodeConnection) else image
        
        return {
            "class_type": "IPAdapter",
            "inputs": {
                "model": model_ref,
                "ipadapter": ipa_ref,
                "image": img_ref,
                "weight": weight,
                "noise": noise
            },
            "_meta": {"title": f"IPAdapter_{node_id}"}
        }
    
    # =========================================================================
    # Latent Video
    # =========================================================================
    @staticmethod
    def empty_latent_video(
        node_id: int,
        width: int = 1280,
        height: int = 720,
        length: int = 120,
        batch_size: int = 1
    ) -> Dict[str, Any]:
        """Create empty latent video."""
        return {
            "class_type": "EmptyLatentVideo",
            "inputs": {
                "width": width,
                "height": height,
                "length": length,
                "batch_size": batch_size
            },
            "_meta": {"title": f"EmptyLatentVideo_{node_id}"}
        }
    
    # =========================================================================
    # Output Nodes
    # =========================================================================
    @staticmethod
    def video_combine(
        images: Union[NodeConnection, List],
        node_id: int,
        frame_rate: int = 24,
        filename_prefix: str = "output",
        format: str = "video/h264-mp4"
    ) -> Dict[str, Any]:
        """Combine frames into video output."""
        img_ref = [images.source_node_id, images.source_output_index] if isinstance(images, NodeConnection) else images
        
        return {
            "class_type": "VHS_VideoCombine",
            "inputs": {
                "images": img_ref,
                "frame_rate": frame_rate,
                "loop_count": 0,
                "filename_prefix": filename_prefix,
                "format": format,
                "pingpong": False,
                "save_output": True
            },
            "_meta": {"title": "OUTPUT_NODE"}
        }
    
    @staticmethod
    def save_image(
        images: Union[NodeConnection, List],
        node_id: int,
        filename_prefix: str = "environment"
    ) -> Dict[str, Any]:
        """Save image output."""
        img_ref = [images.source_node_id, images.source_output_index] if isinstance(images, NodeConnection) else images
        
        return {
            "class_type": "SaveImage",
            "inputs": {
                "images": img_ref,
                "filename_prefix": filename_prefix
            },
            "_meta": {"title": "OUTPUT_NODE"}
        }
    
    # =========================================================================
    # Node Factory Method
    # =========================================================================
    @classmethod
    def get_node(cls, node_type: str, node_id: int, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Factory method to get any node by type name.
        Used by GraphMutator for dynamic injection.
        """
        params = params or {}
        
        node_map = {
            "LoadImage": lambda: cls.load_image(params.get("path", ""), node_id),
            "LoadVideo": lambda: cls.load_video(params.get("path", ""), node_id),
            "SAM2VideoSegmentation": lambda: cls.sam2_video_segmentation(params.get("video_input", []), node_id),
            "VideoMaskPropagator": lambda: cls.video_mask_propagator(params.get("mask", []), params.get("video", []), node_id),
            "ICLight": lambda: cls.ic_light(params.get("foreground", []), params.get("environment", []), node_id, params.get("intensity", 1.0)),
            "DepthControlNet": lambda: cls.depth_controlnet(params.get("image", []), params.get("conditioning", []), node_id, params.get("strength", 0.8)),
            "CannyControlNet": lambda: cls.canny_controlnet(params.get("image", []), params.get("conditioning", []), node_id, params.get("strength", 0.7)),
            "ColorGrade": lambda: cls.color_grade(params.get("image", []), node_id, params.get("preset", "cinematic")),
            "IPAdapter": lambda: cls.ip_adapter(params.get("model", []), params.get("ipadapter", []), params.get("image", []), node_id),
            "VideoCombine": lambda: cls.video_combine(params.get("images", []), node_id),
        }
        
        if node_type in node_map:
            return node_map[node_type]()
        else:
            raise ValueError(f"Unknown node type: {node_type}")
