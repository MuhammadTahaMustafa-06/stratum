"""
Retrieval service: ChromaDB dense search + Whoosh BM25 lexical search.

BM25 fix: metadata is synced from ChromaDB into Whoosh at index build time,
          and enriched post-query via ChromaDB lookup so filters work correctly.
"""
from pathlib import Path
from typing import Any, Dict, List, Optional

from chromadb.errors import NotFoundError
from sentence_transformers import SentenceTransformer
from whoosh.fields import ID, TEXT, Schema, STORED
from whoosh.index import create_in, exists_in, open_dir
from whoosh.qparser import MultifieldParser, OrGroup

from app.core.config import settings
from app.db.chroma_client import chroma_client
from app.services.monitoring_service import Monitoring

logger = Monitoring.get_logger()


class RetrievalService:
    def __init__(self):
        self.chroma_client = chroma_client.get_client()
        self.collection = None
        self.refresh_chroma_collection()

        self.embedding_model = SentenceTransformer(settings.embedding_model)
        self.whoosh_dir = Path(settings.whoosh_index_dir)
        self._ensure_whoosh_index()

    def refresh_chroma_collection(self) -> None:
        """
        Re-fetch the collection handle. Required after external ingestion drops/recreates
        the collection (new internal id) while this API process still holds a stale handle.
        """
        try:
            self.collection = self.chroma_client.get_collection(settings.chroma_collection)
            logger.info("ChromaDB collection loaded.")
        except Exception as e:
            logger.warning("ChromaDB collection not available (has ingestion run?): %s", e)
            self.collection = None

    def chroma_document_count(self) -> int:
        """Vector count for admin UI; rebounds once if the cached handle is stale."""
        for _ in range(2):
            if not self.collection:
                self.refresh_chroma_collection()
            if not self.collection:
                return 0
            try:
                return int(self.collection.count())
            except NotFoundError:
                logger.info("ChromaDB collection id stale (re-ingestion?); rebounding handle.")
                self.collection = None
        return 0

    def distinct_indexed_pdf_basenames(self) -> set[str]:
        """
        Distinct lowercased PDF basenames found in Chroma chunk metadata (file_name / source_file).
        Used for admin reconciliation of raw PDFs vs the vector index.
        """
        out: set[str] = set()
        for _ in range(2):
            if not self.collection:
                self.refresh_chroma_collection()
            if not self.collection:
                return out
            try:
                all_docs = self.collection.get(include=["metadatas"])
                break
            except NotFoundError:
                self.collection = None
        else:
            return out
        for meta in all_docs.get("metadatas", []) or []:
            m = meta or {}
            raw = m.get("file_name") or m.get("source_file") or ""
            if not raw:
                continue
            name = str(raw).strip()
            if not name.lower().endswith(".pdf"):
                continue
            base = Path(name).name.lower()
            if base:
                out.add(base)
        return out

    def _chroma_count_safe(self) -> int:
        if not self.collection:
            return 0
        try:
            return int(self.collection.count())
        except NotFoundError:
            self.refresh_chroma_collection()
            return int(self.collection.count()) if self.collection else 0

    # ─── Whoosh BM25 ────────────────────────────────────────────────────────

    def _ensure_whoosh_index(self) -> None:
        """
        Build Whoosh index from ChromaDB documents, storing both content AND
        a JSON-serialised metadata blob so that metadata filters apply to BM25
        results identically to vector results.
        """
        import json

        schema = Schema(
            doc_id=ID(stored=True, unique=True),
            content=TEXT(stored=True),
            domain=ID(stored=True),
            team=ID(stored=True),
            system=ID(stored=True),
            process=ID(stored=True),
            meta_blob=STORED,
        )

        self.whoosh_dir.mkdir(parents=True, exist_ok=True)

        chroma_count = self._chroma_count_safe()

        # Rebuild if: index missing, or stale (doc count mismatch vs ChromaDB)
        needs_build = not exists_in(str(self.whoosh_dir))
        if not needs_build:
            try:
                tmp_ix = open_dir(str(self.whoosh_dir))
                with tmp_ix.searcher() as s:
                    whoosh_count = s.doc_count()
                if whoosh_count != chroma_count:
                    logger.info(
                        f"Whoosh ({whoosh_count}) ≠ ChromaDB ({chroma_count}) — rebuilding index."
                    )
                    import shutil
                    shutil.rmtree(str(self.whoosh_dir))
                    self.whoosh_dir.mkdir(parents=True, exist_ok=True)
                    needs_build = True
            except Exception:
                needs_build = True

        if needs_build:
            ix = create_in(str(self.whoosh_dir), schema)
            writer = ix.writer()
            if self.collection:
                try:
                    all_docs = self.collection.get(include=["documents", "metadatas"])
                except NotFoundError:
                    self.refresh_chroma_collection()
                    all_docs = (
                        self.collection.get(include=["documents", "metadatas"])
                        if self.collection
                        else {"ids": [], "documents": [], "metadatas": []}
                    )
                for doc_id, text, meta in zip(
                    all_docs.get("ids", []),
                    all_docs.get("documents", []),
                    all_docs.get("metadatas", []),
                ):
                    meta = self._normalise_meta(meta or {})
                    writer.add_document(
                        doc_id=str(doc_id),
                        content=text or "",
                        domain=str(meta.get("domain", "")),
                        team=str(meta.get("team", "")),
                        system=str(meta.get("system", "")),
                        process=str(meta.get("process", "")),
                        meta_blob=json.dumps(meta),
                    )
            writer.commit()
            logger.info(f"Whoosh BM25 index built with {chroma_count} docs from ChromaDB.")

        self.ix = open_dir(str(self.whoosh_dir))

    def rebuild_whoosh_index(self) -> int:
        """Force-rebuild the Whoosh index (called after re-ingestion)."""
        import json
        import shutil

        self.refresh_chroma_collection()

        if self.whoosh_dir.exists():
            shutil.rmtree(self.whoosh_dir)
        self.whoosh_dir.mkdir(parents=True, exist_ok=True)

        schema = Schema(
            doc_id=ID(stored=True, unique=True),
            content=TEXT(stored=True),
            domain=ID(stored=True),
            team=ID(stored=True),
            system=ID(stored=True),
            process=ID(stored=True),
            meta_blob=STORED,
        )
        ix = create_in(str(self.whoosh_dir), schema)
        writer = ix.writer()
        count = 0
        if self.collection:
            try:
                all_docs = self.collection.get(include=["documents", "metadatas"])
            except NotFoundError:
                self.refresh_chroma_collection()
                all_docs = (
                    self.collection.get(include=["documents", "metadatas"])
                    if self.collection
                    else {"ids": [], "documents": [], "metadatas": []}
                )
            for doc_id, text, meta in zip(
                all_docs.get("ids", []),
                all_docs.get("documents", []),
                all_docs.get("metadatas", []),
            ):
                meta = self._normalise_meta(meta or {})
                writer.add_document(
                    doc_id=str(doc_id),
                    content=text or "",
                    domain=str(meta.get("domain", "")),
                    team=str(meta.get("team", "")),
                    system=str(meta.get("system", "")),
                    process=str(meta.get("process", "")),
                    meta_blob=json.dumps(meta),
                )
                count += 1
        writer.commit()
        self.ix = open_dir(str(self.whoosh_dir))
        logger.info(f"Whoosh index rebuilt with {count} documents.")
        return count

    # ─── Metadata normalisation ───────────────────────────────────────────────

    # Legacy domain values produced by older ingestion runs → current KMS values
    _DOMAIN_ALIASES: Dict[str, str] = {
        "operations":   "process",
        "payments":     "banking",
        "lending":      "banking",
        "compliance":   "banking",
        "risk":         "banking",
        "engineering":  "application",
        "devops":       "application",
    }

    @staticmethod
    def _normalise_meta(meta: Dict[str, Any]) -> Dict[str, Any]:
        """
        Adds canonical keys so that upstream code (LLM context, frontend)
        always finds `source_file` and a KMS-aligned `domain` value.
        """
        m = dict(meta)
        # source_file alias — ingestion stores 'file_name'
        if "source_file" not in m:
            m["source_file"] = m.get("file_name", m.get("doc_id", ""))
        # domain alignment
        raw_domain = m.get("domain", "")
        m["domain"] = RetrievalService._DOMAIN_ALIASES.get(raw_domain, raw_domain) or "general"
        return m

    # ─── Filter helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _passes_metadata_filters(
        metadata: Dict[str, Any], filters: Optional[Dict[str, str]]
    ) -> bool:
        if not filters:
            return True
        for key, value in filters.items():
            if value is None:
                continue
            if str(metadata.get(key, "")).lower() != str(value).lower():
                return False
        return True

    # ─── Vector search ───────────────────────────────────────────────────────

    def search_vector(
        self, query: str, metadata_filters: Optional[Dict[str, str]] = None
    ) -> List[Dict[str, Any]]:
        if not self.collection:
            return []
        vector = self.embedding_model.encode([query], normalize_embeddings=True)[0].tolist()
        try:
            results = self.collection.query(
                query_embeddings=[vector],
                n_results=settings.top_k_vector,
                include=["documents", "metadatas", "distances"],
            )
        except NotFoundError:
            self.refresh_chroma_collection()
            if not self.collection:
                return []
            results = self.collection.query(
                query_embeddings=[vector],
                n_results=settings.top_k_vector,
                include=["documents", "metadatas", "distances"],
            )
        out = []
        for ids, dists, docs, metas in zip(
            results.get("ids", []),
            results.get("distances", []),
            results.get("documents", []),
            results.get("metadatas", []),
        ):
                for i in range(len(ids)):
                    meta = self._normalise_meta(metas[i] or {})
                    if not self._passes_metadata_filters(meta, metadata_filters):
                        continue
                    out.append({"id": ids[i], "text": docs[i], "metadata": meta, "distance": dists[i]})
        return out

    # ─── BM25 search ─────────────────────────────────────────────────────────

    def search_bm25(
        self, query: str, metadata_filters: Optional[Dict[str, str]] = None
    ) -> List[Dict[str, Any]]:
        import json

        out = []
        try:
            with self.ix.searcher() as searcher:
                parser = MultifieldParser(["content"], self.ix.schema, group=OrGroup)
                q = parser.parse(query)
                hits = searcher.search(q, limit=settings.top_k_bm25)
                for rank, hit in enumerate(hits):
                    meta = self._normalise_meta(json.loads(hit.get("meta_blob") or "{}"))
                    if not self._passes_metadata_filters(meta, metadata_filters):
                        continue
                    out.append({
                        "id": hit["doc_id"],
                        "text": hit["content"],
                        "score": hit.score,
                        "bm25_rank": rank,
                        "metadata": meta,
                    })
        except Exception as e:
            logger.warning(f"BM25 search error: {e}")
        return out
