import os
from typing import List, Optional
from threading import Lock

MODEL_NAME = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

# Lazy singletons: sentence-transformers pulls PyTorch (heavy). Loading it at
# import time crashes small servers (e.g. Render free tier, 512MB RAM) before
# the app even starts. We only load it on first use.
_embedder = None
_embedder_lock = Lock()


def get_embedder():
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                from sentence_transformers import SentenceTransformer
                _embedder = SentenceTransformer(MODEL_NAME)
    return _embedder


class LocalVectorIndex:
    def __init__(self):
        self.index = None  # created lazily, needs embedder dimension
        self.texts: List[str] = []
        self._lock = Lock()

    def _ensure_index(self):
        if self.index is None:
            import faiss
            dim = get_embedder().get_sentence_embedding_dimension()
            self.index = faiss.IndexFlatL2(dim)

    def add(self, texts: List[str]):
        with self._lock:
            try:
                self._ensure_index()
            except ImportError:
                # Embedding stack not installed; store raw text as fallback
                self.texts.extend(texts)
                return
            embs = get_embedder().encode(texts, show_progress_bar=False, convert_to_numpy=True)
            if len(embs.shape) == 1:
                embs = embs.reshape(1, -1)
            self.index.add(embs.astype("float32"))
            self.texts.extend(texts)

    def query(self, q: str, k: int = 5) -> List[str]:
        if not self.texts:
            return []
        if self.index is None:
            # Fallback when embeddings unavailable: return most recent texts
            return self.texts[-k:]
        q_emb = get_embedder().encode([q], convert_to_numpy=True).astype("float32")
        D, I = self.index.search(q_emb, k)
        results: List[str] = []
        for idx in I[0]:
            if 0 <= idx < len(self.texts):
                results.append(self.texts[idx])
        return results


def llm_generate(prompt: str, max_tokens: int = 3000, temperature: float = 0.2) -> str:
    # LLM_BASE_URL / LLM_MODEL / LLM_API_KEY let this point at any
    # OpenAI-compatible endpoint (e.g. Gemini's OpenAI-compat API). Unset,
    # it falls back to OpenAI's own endpoint via OPENAI_API_KEY/OPENAI_MODEL.
    key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("LLM_API_KEY (or OPENAI_API_KEY) not set in environment")
    base_url = os.getenv("LLM_BASE_URL")
    model = os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    extra_kwargs = {}
    if base_url:
        # Non-OpenAI providers behind an OpenAI-compat shim (e.g. Gemini's
        # "thinking" models) can burn the whole max_tokens budget on hidden
        # reasoning tokens before producing visible output, truncating the
        # draft (finish_reason "length" with near-empty content). Keeping
        # reasoning light avoids that. Plain OpenAI models don't accept/need
        # this param, so it's only sent for non-default endpoints.
        extra_kwargs["reasoning_effort"] = "low"

    # openai>=1.0 client API (openai.ChatCompletion was removed in v1.0)
    from openai import OpenAI
    client = OpenAI(api_key=key, base_url=base_url)
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a legal drafting assistant for Indian law. Never invent case citations, act sections, or judgment numbers; mark uncertain provisions as [VERIFY]."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
        **extra_kwargs,
    )
    return resp.choices[0].message.content


VECTOR_INDEX = LocalVectorIndex()
