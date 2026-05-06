"""
Chroma Vector Database Client Wrapper
Singleton to prevent loading instances redundantly cross-app.
"""
from chromadb import PersistentClient
from typing import Optional
from app.core.config import settings
from app.services.monitoring_service import Monitoring

logger = Monitoring.get_logger()

class ChromaClientWrapper:
    _instance: Optional[PersistentClient] = None

    @classmethod
    def get_client(cls) -> PersistentClient:
        if cls._instance is None:
            logger.info(f"Initializing ChromaDB Client Wrapper at {settings.chroma_persist_dir}")
            cls._instance = PersistentClient(path=settings.chroma_persist_dir)
        return cls._instance

chroma_client = ChromaClientWrapper()
