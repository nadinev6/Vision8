from typing import Dict, List, Optional
import os
import structlog
from elasticsearch import Elasticsearch, helpers
from elasticsearch.exceptions import ElasticsearchException
import requests
from tenacity import retry, stop_after_attempt, wait_exponential
from datetime import datetime
import sys
from dotenv import load_dotenv
from .cache_service import CacheService

# Configure logging
logger = structlog.get_logger()

# Load environment variables
load_dotenv()

class ElasticService:
    def __init__(self):
        """Initialize Elasticsearch client and cache service"""
        elastic_url = os.getenv('ELASTIC_URL')
        elastic_api_key = os.getenv('ELASTIC_API_KEY')
        
        if not elastic_url or not elastic_api_key:
            raise ValueError("ELASTIC_URL and ELASTIC_API_KEY must be configured")
            
        self.es_client = Elasticsearch(
            elastic_url,
            api_key=elastic_api_key,
            verify_certs=True
        )
        self.index_name = os.getenv('ELASTIC_INDEX', 'scene_segments')
        self.cache_service = CacheService()
        
        # Verify connection
        if not self.es_client.ping():
            raise ConnectionError("Could not connect to Elasticsearch")
        
        logger.info("elasticsearch_connection_established", 
                   url=elastic_url,
                   index=self.index_name)
                   
        # Ensure index exists with proper mappings
        self.create_index_if_not_exists()

    def create_index_if_not_exists(self):
        """Create the Elasticsearch index with proper mappings if it doesn't exist."""
        try:
            if not self.es_client.indices.exists(index=self.index_name):
                mappings = {
                    "mappings": {
                        "properties": {
                            "video_id": {"type": "keyword"},
                            "scene_id": {"type": "keyword"},
                            "start_time_ms": {"type": "long"},
                            "end_time_ms": {"type": "long"},
                            "scene_summary": {"type": "text"},
                            "full_description": {"type": "text"},
                            "scene_embedding": {
                                "type": "dense_vector",
                                "dims": 768,
                                "index": True,
                                "similarity": "cosine"
                            },
                            "transcript_phrases": {
                                "type": "nested",
                                "properties": {
                                    "text": {"type": "text"},
                                    "start_ms": {"type": "long"},
                                    "end_ms": {"type": "long"},
                                    "speaker": {"type": "keyword"}
                                }
                            },
                            "objects_tracked": {
                                "type": "nested",
                                "properties": {
                                    "label": {"type": "keyword"},
                                    "track_id": {"type": "keyword"},
                                    "boxes": {
                                        "type": "nested",
                                        "properties": {
                                            "frame_ms": {"type": "long"},
                                            "xmin": {"type": "float"},
                                            "ymin": {"type": "float"},
                                            "xmax": {"type": "float"},
                                            "ymax": {"type": "float"}
                                        }
                                    }
                                }
                            },
                            "actions_detected": {"type": "keyword"},
                            "ingestion_timestamp": {"type": "date"}
                        }
                    },
                    "settings": {
                        "index": {
                            "number_of_shards": 1,
                            "number_of_replicas": 1
                        }
                    }
                }
                
                self.es_client.indices.create(
                    index=self.index_name,
                    body=mappings
                )
                logger.info("index_created", index=self.index_name)

        except ElasticsearchException as e:
            logger.error("index_creation_failed",
                        index=self.index_name,
                        error=str(e))
            raise

    async def ingest_document(self, metadata: Dict) -> bool:
        """
        Ingest a document into Elasticsearch
        
        Args:
            metadata: The document to ingest
            
        Returns:
            bool: True if ingestion was successful
            
        Raises:
            ValueError: If document size exceeds limit
            ElasticsearchException: If ingestion fails
        """
        try:
            # Validate document size
            doc_size = sys.getsizeof(str(metadata))
            max_size = int(os.getenv('ES_MAX_DOCUMENT_SIZE', '100MB').replace('MB', '')) * 1024 * 1024
            
            if doc_size > max_size:
                raise ValueError(f"Document size ({doc_size} bytes) exceeds maximum allowed size ({max_size} bytes)")

            # Add ingestion timestamp
            metadata['ingestion_timestamp'] = datetime.utcnow().isoformat()

            # Index the document
            response = self.es_client.index(
                index=self.index_name,
                document=metadata,
                id=metadata.get('scene_id')
            )

            logger.info("document_ingested",
                       scene_id=metadata.get('scene_id'),
                       status=response['result'])
            
            return True

        except Exception as e:
            logger.error("document_ingestion_failed",
                        scene_id=metadata.get('scene_id'),
                        error=str(e))
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def search_video_content(
        self,
        query: str,
        min_score: float = 0.7,
        max_results: int = 20,
        include_raw: bool = False
    ) -> List[Dict]:
        """
        Search video content using semantic search
        
        Args:
            query: The search query
            min_score: Minimum relevance score (0-1)
            max_results: Maximum number of results to return
            include_raw: Whether to include raw Elasticsearch response
            
        Returns:
            List of matching video segments
        """
        try:
            # Construct search query
            search_query = {
                "bool": {
                    "must": [
                        {
                            "multi_match": {
                                "query": query,
                                "fields": [
                                    "scene_summary^3",
                                    "full_description^2",
                                    "transcript_phrases.text^1.5",
                                    "objects_tracked.label"
                                ],
                                "type": "most_fields",
                                "operator": "or",
                                "fuzziness": "AUTO"
                            }
                        }
                    ],
                    "should": [
                        {
                            "nested": {
                                "path": "transcript_phrases",
                                "query": {
                                    "match": {
                                        "transcript_phrases.text": {
                                            "query": query,
                                            "boost": 1.5
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            }

            # Execute search with highlighting
            response = self.es_client.search(
                index=self.index_name,
                query=search_query,
                size=max_results,
                min_score=min_score,
                highlight={
                    "fields": {
                        "scene_summary": {},
                        "full_description": {},
                        "transcript_phrases.text": {}
                    },
                    "pre_tags": ["<mark>"],
                    "post_tags": ["</mark>"]
                }
            )

            # Process results
            results = []
            for hit in response["hits"]["hits"]:
                source = hit["_source"]
                result = {
                    "scene_id": source["scene_id"],
                    "time_ms": source["start_time_ms"],
                    "end_time_ms": source["end_time_ms"],
                    "summary": source["scene_summary"],
                    "description": source["full_description"],
                    "score": hit["_score"],
                    "highlights": hit.get("highlight", {}),
                    "transcript": source.get("transcript_phrases", []),
                    "objects": source.get("objects_tracked", []),
                    "actions": source.get("actions_detected", [])
                }
                if include_raw:
                    result["_raw"] = hit
                results.append(result)

            logger.info("search_completed",
                       query=query,
                       results_count=len(results),
                       max_score=response["hits"]["max_score"])

            return results

        except Exception as e:
            logger.error("search_failed",
                        query=query,
                        error=str(e))
            raise

    async def bulk_index_documents(self, documents: List[Dict]) -> tuple:
        """
        Bulk index multiple documents
        
        Args:
            documents: List of documents to index
            
        Returns:
            tuple: (success_count, failed_operations)
        """
        try:
            actions = []
            max_size = int(os.getenv('ES_MAX_DOCUMENT_SIZE', '100MB').replace('MB', '')) * 1024 * 1024
            
            for doc in documents:
                # Validate each document
                doc_size = sys.getsizeof(str(doc))
                if doc_size > max_size:
                    logger.warning("document_size_exceeds_limit",
                                 scene_id=doc.get('scene_id'),
                                 size=doc_size)
                    continue
                    
                doc['ingestion_timestamp'] = datetime.utcnow().isoformat()
                actions.append({
                    "_index": self.index_name,
                    "_id": doc.get('scene_id'),
                    "_source": doc
                })

            if not actions:
                return 0, []

            success, failed = helpers.bulk(
                client=self.es_client,
                actions=actions,
                chunk_size=int(os.getenv('ES_BULK_SIZE', '5MB').replace('MB', '')) * 1024 * 1024,
                max_retries=3
            )

            logger.info("bulk_indexing_completed",
                       success_count=success,
                       failed_count=len(failed))

            return success, failed

        except ElasticsearchException as e:
            logger.error("bulk_indexing_failed", error=str(e))
            raise

    def __del__(self):
        """Cleanup connections"""
        try:
            self.es_client.close()
            logger.info("elasticsearch_connection_closed")
        except:
            pass
