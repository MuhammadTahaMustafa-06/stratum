#!/usr/bin/env python3
"""
Offline RAG evaluation using data/eval_qa.json.

- Retrieval: precision/recall @ reranked top-K vs ground_truth_doc_id (unchanged).
- Generation quality: Ragas faithfulness + answer_relevancy (Groq LLM + local embeddings).

Run from backend/:
  python tools/evaluate_rag.py

Requires GROQ_API_KEY and backend deps including ragas (see requirements-ci.txt).
"""
from __future__ import annotations

import json
import os
import sys
import warnings
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.chdir(BACKEND_ROOT)

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

warnings.filterwarnings(
    "ignore",
    message=".*Importing (faithfulness|answer_relevancy) from 'ragas.metrics' is deprecated.*",
    category=DeprecationWarning,
)
warnings.filterwarnings("ignore", category=UserWarning, module="langchain*")

from app.core.config import settings  # noqa: E402
from app.services.fusion import reciprocal_rank_fusion  # noqa: E402
from app.services.llm_service import LLMService  # noqa: E402
from app.services.rag_providers import get_reranker_service, get_retrieval_service  # noqa: E402

DATA_DIR = BACKEND_ROOT / "data"
EVAL_IN = DATA_DIR / "eval_qa.json"
EVAL_OUT = DATA_DIR / "eval_metrics_results.json"


def _build_ragas_evaluator():
    from openai import OpenAI
    from langchain_community.embeddings import HuggingFaceEmbeddings
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import llm_factory
    from ragas.metrics import answer_relevancy, faithfulness

    if not os.environ.get("GROQ_API_KEY"):
        raise RuntimeError("GROQ_API_KEY is required for Ragas LLM metrics.")

    client = OpenAI(
        api_key=os.environ["GROQ_API_KEY"],
        base_url="https://api.groq.com/openai/v1",
    )
    llm = llm_factory(settings.llm_model, client=client)
    emb = LangchainEmbeddingsWrapper(
        HuggingFaceEmbeddings(model_name=settings.embedding_model or "all-MiniLM-L6-v2")
    )
    return llm, emb, [faithfulness, answer_relevancy]


def run_evaluation() -> None:
    try:
        from ragas import EvaluationDataset, evaluate
    except ImportError as e:
        print("Ragas is not installed. Install backend deps: pip install -r requirements-ci.txt", file=sys.stderr)
        raise e

    if not EVAL_IN.exists():
        print(f"Missing {EVAL_IN}. Add an eval set or generate QA pairs separately.")
        return

    with open(EVAL_IN, encoding="utf-8") as f:
        qa_data = json.load(f)

    retriever = get_retrieval_service()
    reranker = get_reranker_service()
    llm_svc = LLMService()

    llm, emb, ragas_metrics = _build_ragas_evaluator()

    metrics: dict[str, list[float]] = {
        "precision_at_k": [],
        "recall_at_k": [],
    }
    ragas_rows: list[dict] = []
    row_ids: list[str] = []

    print(f"Starting evaluation of {len(qa_data)} QA pairs...")

    for idx, item in enumerate(qa_data):
        query = item["question"]
        gt_doc_id = item.get("ground_truth_doc_id", "")
        row_id = item.get("id", f"row_{idx}")
        row_ids.append(row_id)

        print(f"\n--- query {idx + 1}/{len(qa_data)} ({row_id}) ---")

        vector_results = retriever.search_vector(query)
        bm25_results = retriever.search_bm25(query)
        hybrid_results = reciprocal_rank_fusion(vector_results, bm25_results)
        top_chunks = reranker.score_and_rank(query, hybrid_results)

        retrieved_doc_ids = [str(c.get("metadata", {}).get("doc_id", "")) for c in top_chunks]
        is_hit = gt_doc_id in retrieved_doc_ids
        precision = 1.0 / len(retrieved_doc_ids) if is_hit and retrieved_doc_ids else 0.0
        recall = 1.0 if is_hit else 0.0
        metrics["precision_at_k"].append(precision)
        metrics["recall_at_k"].append(recall)
        print(f"Retrieval - Precision: {precision:.2f}, Recall: {recall:.2f}")

        if not top_chunks:
            answer = "I don't know."
        else:
            answer = llm_svc.generate_answer(query, top_chunks)

        contexts = [c.get("text", "") for c in top_chunks if c.get("text")]
        if not contexts:
            contexts = [""]

        ragas_rows.append(
            {
                "user_input": query,
                "response": answer,
                "retrieved_contexts": contexts,
            }
        )

    eval_ds = EvaluationDataset.from_list(ragas_rows)

    print("\nRunning Ragas (faithfulness, answer_relevancy)…")
    ragas_result = evaluate(
        dataset=eval_ds,
        metrics=ragas_metrics,
        llm=llm,
        embeddings=emb,
        raise_exceptions=False,
    )

    ragas_means = getattr(ragas_result, "_repr_dict", {})
    print("\n===== RAGAS (aggregate) =====")
    for k, v in ragas_means.items():
        print(f"  {k}: {v:.4f}")

    per_row_scores = ragas_result.scores
    ragas_detail = [
        {"id": row_ids[i], **per_row_scores[i]} for i in range(len(per_row_scores))
    ]

    summary = {
        "retrieval": {
            "precision_at_k": metrics["precision_at_k"],
            "recall_at_k": metrics["recall_at_k"],
            "mean_precision": sum(metrics["precision_at_k"]) / len(metrics["precision_at_k"])
            if metrics["precision_at_k"]
            else 0.0,
            "mean_recall": sum(metrics["recall_at_k"]) / len(metrics["recall_at_k"])
            if metrics["recall_at_k"]
            else 0.0,
        },
        "ragas": {
            "faithfulness": ragas_means.get("faithfulness"),
            "answer_relevancy": ragas_means.get("answer_relevancy"),
        },
        "ragas_per_question": ragas_detail,
    }

    print("\n===== RETRIEVAL (mean) =====")
    print(f"  mean_precision: {summary['retrieval']['mean_precision']:.4f}")
    print(f"  mean_recall: {summary['retrieval']['mean_recall']:.4f}")

    with open(EVAL_OUT, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"\nWrote {EVAL_OUT}")


if __name__ == "__main__":
    run_evaluation()
