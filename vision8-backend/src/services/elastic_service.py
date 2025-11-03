from typing import Dict, List, Optional
import os
import structlog
import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from datetime import datetime
import sys
from dotenv import load_dotenv
from services.langcache_service import LangCacheService

# Configure logging
logger = structlog.get_logger()

# Load environment variables
load_dotenv()

class ElasticService:
    def __init__(self):
        """Initialize cache service only - Elasticsearch removed"""
        self.cache_service = LangCacheService()

        logger.info("elastic_service_initialized_without_elasticsearch",
                   message="Elasticsearch service removed to eliminate cloud costs")

    def create_index_if_not_exists(self):
        """Elasticsearch index creation removed - no longer needed"""
        logger.info("elasticsearch_index_creation_skipped",
                   message="Index creation disabled to eliminate cloud costs")
        return

    async def ingest_document(self, metadata: Dict) -> bool:
        """
        Document ingestion disabled - Elasticsearch removed to eliminate costs

        Args:
            metadata: The document to ingest (ignored)

        Returns:
            bool: Always returns False since ingestion is disabled
        """
        logger.info("document_ingestion_skipped",
                   message="Document ingestion disabled to eliminate cloud costs",
                   scene_id=metadata.get('scene_id'))
        return False

    async def search_video_content(
        self,
        query: str,
        min_score: float = 0.7,
        max_results: int = 20,
        include_raw: bool = False
    ) -> List[Dict]:
        """
        Search functionality disabled - Elasticsearch removed to eliminate costs

        Args:
            query: The search query (ignored)
            min_score: Minimum relevance score (ignored)
            max_results: Maximum number of results (ignored)
            include_raw: Whether to include raw response (ignored)

        Returns:
            Empty list since search is disabled
        """
        logger.info("search_skipped",
                   message="Search functionality disabled to eliminate cloud costs",
                   query=query)
        return []

    async def bulk_index_documents(self, documents: List[Dict]) -> tuple:
        """
        Bulk indexing disabled - Elasticsearch removed to eliminate costs

        Args:
            documents: List of documents to index (ignored)

        Returns:
            tuple: (0, []) since indexing is disabled
        """
        logger.info("bulk_indexing_skipped",
                   message="Bulk indexing disabled to eliminate cloud costs",
                   document_count=len(documents))
        return 0, []

    def __del__(self):
        """Cleanup - no connections to close since Elasticsearch removed"""
        logger.info("elastic_service_cleanup_completed",
                   message="No connections to close - Elasticsearch removed")
