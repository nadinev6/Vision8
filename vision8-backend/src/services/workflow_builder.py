"""
Workflow Builder for Dynamic ComfyUI Graph Construction

Programmatically assembles ComfyUI workflow JSON graphs based on
specific job requirements (I2V, background replace, environment generation).
No templates - builds from scratch using the Node Library.
"""

from typing import Dict, Any, List, Optional
import structlog

from .node_library import NodeLibrary, NodeConnection

logger = structlog.get_logger()


class WorkflowBuilder:
    """
    Dynamic workflow graph construction engine.
    Builds ComfyUI workflow JSON from scratch based on job type.
    """
    
    def __init__(self):
        self.node_library = NodeLibrary
    
    def _get_next_id(self, graph: Dict[str, Any]) -> int:
        """Get the next available node ID."""
        if not graph:
            return 1
        return max(int(k) for k in graph.keys()) + 1
    
    # =========================================================================
    # Environment Generation (Image)
    # =========================================================================
    def build_environment_job(
        self,
        prompt: str,
        negative_prompt: str = "blurry, low quality, distorted, watermark",
        width: int = 1280,
        height: int = 720,
        seed: int = 42,
        steps: int = 25
    ) -> Dict[str, Any]:
        """
        Build workflow for environment/scene image generation.
        
        This creates the "room" image that will be used as:
        1. Background for video compositing
        2. Light source reference for IC-Light
        3. IP-Adapter style lock for video generation
        """
        logger.info("Building environment generation workflow", prompt=prompt[:50])
        
        graph = {}
        node_id = 1
        
        # 1. Checkpoint Loader
        graph[str(node_id)] = self.node_library.checkpoint_loader(
            "sd_xl_base_1.0.safetensors", node_id
        )
        checkpoint_id = str(node_id)
        node_id += 1
        
        # 2. Positive CLIP Encode
        graph[str(node_id)] = self.node_library.clip_text_encode(
            [checkpoint_id, 1],  # CLIP output
            prompt,
            node_id
        )
        positive_id = str(node_id)
        node_id += 1
        
        # 3. Negative CLIP Encode
        graph[str(node_id)] = self.node_library.clip_text_encode(
            [checkpoint_id, 1],
            negative_prompt,
            node_id
        )
        negative_id = str(node_id)
        node_id += 1
        
        # 4. Empty Latent Image
        graph[str(node_id)] = {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            },
            "_meta": {"title": f"EmptyLatent_{node_id}"}
        }
        latent_id = str(node_id)
        node_id += 1
        
        # 5. KSampler
        graph[str(node_id)] = {
            "class_type": "KSampler",
            "inputs": {
                "model": [checkpoint_id, 0],
                "positive": [positive_id, 0],
                "negative": [negative_id, 0],
                "latent_image": [latent_id, 0],
                "seed": seed,
                "steps": steps,
                "cfg": 7.5,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0
            },
            "_meta": {"title": f"KSampler_{node_id}"}
        }
        sampler_id = str(node_id)
        node_id += 1
        
        # 6. VAE Decode
        graph[str(node_id)] = {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": [sampler_id, 0],
                "vae": [checkpoint_id, 2]
            },
            "_meta": {"title": f"VAEDecode_{node_id}"}
        }
        decoded_id = str(node_id)
        node_id += 1
        
        # 7. Save Image
        graph[str(node_id)] = self.node_library.save_image(
            [decoded_id, 0],
            node_id,
            "environment"
        )
        
        return graph
    
    # =========================================================================
    # Image-to-Video (Wan 2.2)
    # =========================================================================
    def build_wan_i2v_job(
        self,
        image_path: str,
        prompt: str,
        negative_prompt: str = "blurry, low quality, distorted",
        seed: int = 42,
        steps: int = 20,
        num_frames: int = 120,
        cfg: float = 7.5,
        ip_adapter_image: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Build Wan 2.2 Image-to-Video workflow.
        
        Takes a generated environment image and creates video from it.
        Optionally includes IP-Adapter for style consistency.
        """
        logger.info("Building Wan 2.2 I2V workflow", image=image_path, prompt=prompt[:50])
        
        graph = {}
        node_id = 1
        
        # 1. Load the environment image
        graph[str(node_id)] = self.node_library.load_image(image_path, node_id)
        image_id = str(node_id)
        node_id += 1
        
        # 2. Wan 2.2 Checkpoint
        graph[str(node_id)] = self.node_library.checkpoint_loader(
            "wan22_video.safetensors", node_id
        )
        checkpoint_id = str(node_id)
        node_id += 1
        
        # 3. Positive CLIP Encode
        graph[str(node_id)] = self.node_library.clip_text_encode(
            [checkpoint_id, 1],
            prompt,
            node_id
        )
        positive_id = str(node_id)
        node_id += 1
        
        # 4. Negative CLIP Encode
        graph[str(node_id)] = self.node_library.clip_text_encode(
            [checkpoint_id, 1],
            negative_prompt,
            node_id
        )
        negative_id = str(node_id)
        node_id += 1
        
        # 5. I2V Latent from image
        graph[str(node_id)] = self.node_library.wan22_i2v_latent(
            [image_id, 0],
            node_id,
            num_frames=num_frames
        )
        latent_id = str(node_id)
        node_id += 1
        
        # 6. (Optional) IP-Adapter for style lock
        model_input = [checkpoint_id, 0]
        if ip_adapter_image:
            # Load IP-Adapter
            graph[str(node_id)] = self.node_library.ip_adapter_loader(
                "ip-adapter-plus_sd15.bin", node_id
            )
            ipa_loader_id = str(node_id)
            node_id += 1
            
            # Load IP-Adapter image
            graph[str(node_id)] = self.node_library.load_image(ip_adapter_image, node_id)
            ipa_image_id = str(node_id)
            node_id += 1
            
            # Apply IP-Adapter
            graph[str(node_id)] = self.node_library.ip_adapter(
                [checkpoint_id, 0],
                [ipa_loader_id, 0],
                [ipa_image_id, 0],
                node_id,
                weight=0.7
            )
            model_input = [str(node_id), 0]
            node_id += 1
        
        # 7. Wan 2.2 Sampler
        graph[str(node_id)] = self.node_library.wan22_sampler(
            model_input,
            [positive_id, 0],
            [negative_id, 0],
            [latent_id, 0],
            node_id,
            seed=seed,
            steps=steps,
            cfg=cfg
        )
        sampler_id = str(node_id)
        node_id += 1
        
        # 8. VAE Decode
        graph[str(node_id)] = {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": [sampler_id, 0],
                "vae": [checkpoint_id, 2]
            },
            "_meta": {"title": f"VAEDecode_{node_id}"}
        }
        decoded_id = str(node_id)
        node_id += 1
        
        # 9. Video Output
        graph[str(node_id)] = self.node_library.video_combine(
            [decoded_id, 0],
            node_id,
            filename_prefix="wan_i2v"
        )
        
        return graph
    
    # =========================================================================
    # Background Replacement (Pro-Realism)
    # =========================================================================
    def build_background_replace_job(
        self,
        source_video_path: str,
        environment_image_path: str,
        prompt: Optional[str] = None,
        apply_ic_light: bool = True,
        ic_light_intensity: float = 1.0
    ) -> Dict[str, Any]:
        """
        Build Pro-Realism background replacement workflow.
        
        Pipeline:
        1. Load source video (talking-head)
        2. SAM2 segmentation on first frame
        3. Video Mask Propagator for temporal stability
        4. Load environment image
        5. IC-Light for relighting
        6. Composite foreground on new background
        """
        logger.info("Building background replacement workflow",
                   video=source_video_path,
                   environment=environment_image_path)
        
        graph = {}
        node_id = 1
        
        # 1. Load Source Video
        graph[str(node_id)] = self.node_library.load_video(
            source_video_path, node_id
        )
        video_id = str(node_id)
        node_id += 1
        
        # 2. SAM2 Video Segmentation (first frame)
        graph[str(node_id)] = self.node_library.sam2_video_segmentation(
            [video_id, 0],
            node_id,
            detection_hint="person"
        )
        sam_id = str(node_id)
        node_id += 1
        
        # 3. Video Mask Propagator (temporal stability)
        graph[str(node_id)] = self.node_library.video_mask_propagator(
            [sam_id, 0],  # First frame mask
            [video_id, 0],  # Full video
            node_id,
            propagation_mode="bidirectional",
            smoothing=0.3
        )
        mask_id = str(node_id)
        node_id += 1
        
        # 4. Load Environment Image
        graph[str(node_id)] = self.node_library.load_image(
            environment_image_path, node_id
        )
        env_id = str(node_id)
        node_id += 1
        
        # 5. Extract foreground using mask
        graph[str(node_id)] = {
            "class_type": "ApplyMaskToVideo",
            "inputs": {
                "video": [video_id, 0],
                "mask": [mask_id, 0]
            },
            "_meta": {"title": f"ExtractForeground_{node_id}"}
        }
        foreground_id = str(node_id)
        node_id += 1
        
        # 6. IC-Light Relighting (Auto-injected)
        if apply_ic_light:
            graph[str(node_id)] = self.node_library.ic_light(
                [foreground_id, 0],
                [env_id, 0],
                node_id,
                intensity=ic_light_intensity
            )
            relit_fg_id = str(node_id)
            node_id += 1
        else:
            relit_fg_id = foreground_id
        
        # 7. Composite on new background
        graph[str(node_id)] = self.node_library.composite_video_on_background(
            [relit_fg_id, 0],
            [env_id, 0],
            [mask_id, 0],
            node_id
        )
        composite_id = str(node_id)
        node_id += 1
        
        # 8. Video Output
        graph[str(node_id)] = self.node_library.video_combine(
            [composite_id, 0],
            node_id,
            filename_prefix="bg_replace"
        )
        
        return graph
    
    # =========================================================================
    # Text-to-Video (Full Wan 2.2)
    # =========================================================================
    def build_wan_t2v_job(
        self,
        prompt: str,
        negative_prompt: str = "blurry, low quality, distorted",
        seed: int = 42,
        steps: int = 20,
        num_frames: int = 120,
        width: int = 1280,
        height: int = 720,
        cfg: float = 7.5
    ) -> Dict[str, Any]:
        """
        Build Wan 2.2 Text-to-Video workflow (no image input).
        """
        logger.info("Building Wan 2.2 T2V workflow", prompt=prompt[:50])
        
        graph = {}
        node_id = 1
        
        # 1. Wan 2.2 Checkpoint
        graph[str(node_id)] = self.node_library.checkpoint_loader(
            "wan22_video.safetensors", node_id
        )
        checkpoint_id = str(node_id)
        node_id += 1
        
        # 2. Positive CLIP Encode
        graph[str(node_id)] = self.node_library.clip_text_encode(
            [checkpoint_id, 1],
            prompt,
            node_id
        )
        positive_id = str(node_id)
        node_id += 1
        
        # 3. Negative CLIP Encode
        graph[str(node_id)] = self.node_library.clip_text_encode(
            [checkpoint_id, 1],
            negative_prompt,
            node_id
        )
        negative_id = str(node_id)
        node_id += 1
        
        # 4. Empty Latent Video
        graph[str(node_id)] = self.node_library.empty_latent_video(
            node_id,
            width=width,
            height=height,
            length=num_frames
        )
        latent_id = str(node_id)
        node_id += 1
        
        # 5. Wan 2.2 Sampler
        graph[str(node_id)] = self.node_library.wan22_sampler(
            [checkpoint_id, 0],
            [positive_id, 0],
            [negative_id, 0],
            [latent_id, 0],
            node_id,
            seed=seed,
            steps=steps,
            cfg=cfg
        )
        sampler_id = str(node_id)
        node_id += 1
        
        # 6. VAE Decode
        graph[str(node_id)] = {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": [sampler_id, 0],
                "vae": [checkpoint_id, 2]
            },
            "_meta": {"title": f"VAEDecode_{node_id}"}
        }
        decoded_id = str(node_id)
        node_id += 1
        
        # 7. Video Output
        graph[str(node_id)] = self.node_library.video_combine(
            [decoded_id, 0],
            node_id,
            filename_prefix="wan_t2v"
        )
        
        return graph


# Global instance
workflow_builder = WorkflowBuilder()
