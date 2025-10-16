from typing import Dict, Any, List, Optional
import os
import structlog
import requests
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_exponential
from pydantic import BaseModel, Field

logger = structlog.get_logger()

class VideoSegment(BaseModel):
    scene_id: str
    timestamp_ms: int
    confidence_score: float = Field(ge=0.0, le=1.0)

class SourceAttribution(BaseModel):
    segment: VideoSegment
    relevant_text: str
    context_type: str = Field(default="scene_summary")

class ConversationResponse(BaseModel):
    answer: str
    sources: List[SourceAttribution]
    suggested_followups: List[str]
    metadata: Dict[str, Any]
    timestamp: datetime
    query: str

class ConversationHandler:
    def __init__(self):
        self.gemini_api_key = os.getenv('GEMINI_API_KEY')
        self.gemini_model = os.getenv('GEMINI_MODEL_NAME')
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def generate_response(self, context: List[Dict], query: str) -> str:
        """
        Generate a response using Gemini API with context from search results
        """
        try:
            # Format context for the prompt
            formatted_context = "\n".join([
                f"Scene {item.get('scene_id', 'unknown')} at {item.get('time_ms', 0)}ms: {item.get('summary', '')}"
                for item in context
            ])

            # Construct the prompt
            prompt = {
                "contents": [{
                    "parts": [{
                        "text": f"""Based on the following video context:
                        
                        {formatted_context}
                        
                        User Question: {query}
                        
                        Provide a natural, conversational response that directly addresses the question using only the information from the context provided. If the context doesn't contain relevant information, say so."""
                    }]
                }]
            }

            # Call Gemini API
            response = requests.post(
                self.api_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.gemini_api_key}"
                },
                json=prompt
            )
            response.raise_for_status()
            
            result = response.json()
            answer = result['candidates'][0]['content']['parts'][0]['text']
            
            logger.info("response_generated",
                       query=query,
                       context_items=len(context))
            
            return answer

        except Exception as e:
            logger.error("response_generation_failed",
                        error=str(e),
                        query=query)
            raise

    async def handle_user_query(self, query: str, search_results: List[Dict]) -> ConversationResponse:
        """
        Process user query with context from search results and return formatted response
        """
        try:
            # Generate contextual response
            response = await self.generate_response(search_results, query)
            
            # Format the response with our sophisticated formatter
            formatted_response = await self.format_conversation_response(
                answer=response,
                sources=search_results,
                query=query
            )
            
            logger.info("query_handled_successfully",
                       query=query,
                       sources_count=len(search_results))
            
            return formatted_response

        except Exception as e:
            logger.error("query_handling_failed",
                        error=str(e),
                        query=query)
            raise

    async def format_conversation_response(self, 
                                        answer: str, 
                                        sources: List[Dict],
                                        query: str) -> ConversationResponse:
        """
        Format the conversation response with rich context and metadata
        """
        # Convert search results to SourceAttribution objects
        formatted_sources = [
            SourceAttribution(
                segment=VideoSegment(
                    scene_id=source.get("scene_id", "unknown"),
                    timestamp_ms=source.get("time_ms", 0),
                    confidence_score=source.get("score", 0.95)
                ),
                relevant_text=source.get("summary", ""),
                context_type=source.get("type", "scene_summary")
            )
            for source in sources
        ]

        # Generate contextual follow-up questions
        followups = self._generate_followup_questions(sources, query)

        # Create metadata
        metadata = {
            "model": self.gemini_model,
            "processed_at": datetime.now().isoformat(),
            "total_sources": len(sources),
            "context_types": list(set(s.context_type for s in formatted_sources)),
            "confidence_threshold": 0.8,
            "search_strategy": "hybrid_semantic"
        }

        return ConversationResponse(
            answer=answer,
            sources=formatted_sources,
            suggested_followups=followups,
            metadata=metadata,
            timestamp=datetime.now(),
            query=query
        )

    def _generate_followup_questions(self, sources: List[Dict], query: str) -> List[str]:
        """
        Generate contextual follow-up questions based on search results
        """
        followups = []
        
        # Time-based followups
        if sources and "time_ms" in sources[0]:
            followups.append(
                f"What happens after the scene at {sources[0]['time_ms']//1000} seconds?"
            )

        # Content-based followups
        if any("object" in source for source in sources):
            followups.append("What other objects appear in these scenes?")

        # Context expansion
        followups.append("Can you provide more details about the surrounding context?")

        # Query-specific followup
        followups.append(f"How does this relate to {query.split()[0]}?")

        return followups[:3]  # Limit to 3 suggestions