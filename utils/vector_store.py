import os
import json
import numpy as np
import asyncio
import shutil
import re
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

load_dotenv()

# ── Config ────────────────────────────────────────────────────
WORKING_DIR = "data/lightrag"
INDEX_PATH  = "data/lightrag/graph_chunk_entity_relation.graphml" # Used to check if index exists

# ── Singleton model loader ─────────────────────────────────────
_embed_model = None

def get_embed_model() -> SentenceTransformer:
    """
    Load embedding model once and reuse.
    First call downloads ~90MB — cached locally after that.
    """
    global _embed_model
    if _embed_model is None:
        print("Loading embedding model for LightRAG: all-MiniLM-L6-v2...")
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        print("Embedding model ready")
    return _embed_model


def get_embeddings_batch(texts: list) -> np.ndarray:
    """Get embeddings for a list of texts — faster than one by one."""
    model   = get_embed_model()
    vectors = model.encode(texts, normalize_embeddings=True)
    return vectors.astype("float32")


# ── Custom Async LLM Function for LightRAG ────────────────────
async def custom_llm_model_func(
    prompt: str,
    system_prompt: str = None,
    history_messages: list = [],
    **kwargs
) -> str:
    """
    Asynchronous custom LLM wrapper for LightRAG.
    Adapts parameters and runs synchronous chat_completion in a thread executor.
    """
    from utils.llm_client import chat_completion
    
    # Construct standard messages list
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for msg in history_messages:
        messages.append(msg)
    messages.append({"role": "user", "content": prompt})

    # Get active model or fall back to default
    model = kwargs.get("model", None)
    if not model:
        try:
            import streamlit as st
            model = st.session_state.get("active_model", "gpt-4o-mini")
        except:
            model = "gpt-4o-mini"

    # Run synchronous chat_completion in a thread pool executor
    loop = asyncio.get_running_loop()
    response = await loop.run_in_executor(
        None,
        lambda: chat_completion(
            messages=messages,
            model=model,
            temperature=kwargs.get("temperature", 0.2),
            max_tokens=kwargs.get("max_tokens", 1024)
        )
    )
    return response


# ── Custom Async Embedding Function for LightRAG ──────────────
async def custom_embed_logic(texts: list[str]) -> np.ndarray:
    """Asynchronous custom embedding logic using local model in executor."""
    loop = asyncio.get_running_loop()
    vectors = await loop.run_in_executor(
        None,
        lambda: get_embeddings_batch(texts)
    )
    return vectors

# ── Singleton LightRAG Instance ────────────────────────────────
_rag_instance = None
_rag_loop = None

def get_rag_instance() -> LightRAG:
    """
    Retrieve or initialize the LightRAG instance for the current event loop.
    Re-creates the instance if the active event loop changes to prevent
    'bound to a different event loop' errors from internal locks and queues.
    """
    global _rag_instance, _rag_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _rag_instance is None or _rag_loop is not current_loop:
        os.makedirs(WORKING_DIR, exist_ok=True)
        print(f"Initializing LightRAG instance for loop: {current_loop}")
        
        # Reset the global locks in lightrag shared_storage to prevent loop mismatch errors
        try:
            import lightrag.kg.shared_storage
            if getattr(lightrag.kg.shared_storage, "_initialized", False):
                print("Resetting lightrag.kg.shared_storage globals...")
                lightrag.kg.shared_storage.finalize_share_data()
            lightrag.kg.shared_storage._storage_keyed_lock = None
            lightrag.kg.shared_storage.initialize_share_data()
            print("lightrag.kg.shared_storage reset completed.")
        except Exception as e:
            print(f"Warning: Failed to reset lightrag shared_storage locks: {e}")
        
        # Instantiate a fresh EmbeddingFunc bound to the current event loop
        loop_embedding_func = EmbeddingFunc(
            embedding_dim=384,      # dimension of all-MiniLM-L6-v2
            max_token_size=512,
            func=custom_embed_logic
        )
        
        _rag_instance = LightRAG(
            working_dir=WORKING_DIR,
            llm_model_func=custom_llm_model_func,
            embedding_func=loop_embedding_func
        )
        _rag_loop = current_loop
    return _rag_instance


# ── Core API ───────────────────────────────────────────────────

def build_vector_store(documents: list) -> None:
    """
    Build LightRAG store from a list of document dicts.
    Each document must have 'id', 'title', 'category', and 'content' keys.
    Clears the existing LightRAG directory before building to prevent schemas mismatches.
    """
    global _rag_instance
    _rag_instance = None # Reset instance to reload cleanly
    
    if os.path.exists(WORKING_DIR):
        print(f"Clearing old LightRAG database at {WORKING_DIR}...")
        try:
            shutil.rmtree(WORKING_DIR)
        except Exception as e:
            print(f"Warning: could not delete old working dir: {e}")
            
    os.makedirs(WORKING_DIR, exist_ok=True)
    
    # Run async storage initialization and document insertion inside a temporary loop
    async def run_indexing():
        rag = get_rag_instance()
        await rag.initialize_storages()
        # Format texts with metadata block for better entity-relation extraction
        texts = [
            f"Document ID: {d['id']}\nTitle: {d['title']}\nCategory: {d['category']}\nContent: {d['content']}"
            for d in documents
        ]
        print(f"Indexing {len(texts)} documents into LightRAG...")
        await rag.ainsert(texts)
        print("LightRAG indexing completed.")

    asyncio.run(run_indexing())


def parse_retrieved_chunk(chunk_text: str):
    """
    Helper to parse metadata (id, title, category) out of the chunk content.
    Returns: (doc_id, title, category, content)
    """
    id_match = re.search(r'^Document ID:\s*(\S+)', chunk_text, re.MULTILINE)
    title_match = re.search(r'^Title:\s*(.+)', chunk_text, re.MULTILINE)
    category_match = re.search(r'^Category:\s*(.+)', chunk_text, re.MULTILINE)
    content_match = re.search(r'^Content:\s*(.+)', chunk_text, re.MULTILINE | re.DOTALL)
    
    doc_id = id_match.group(1) if id_match else ""
    title = title_match.group(1) if title_match else "Aurelle Document"
    category = category_match.group(1) if category_match else "Strategy"
    content = content_match.group(1) if content_match else chunk_text
    
    return doc_id, title, category, content.strip()


def search_vector_store(query: str, k: int = 3) -> list:
    """
    Semantic retrieval — returns top-k most relevant documents.
    Directly query the LightRAG instance and parses context results.
    """
    if not os.path.exists(INDEX_PATH):
        print("LightRAG index not found — building now...")
        ensure_index_exists()

    async def run_query():
        rag = get_rag_instance()
        await rag.initialize_storages()
        # Query in hybrid mode (vector + graph) with only_need_context=True to get raw context chunks
        res = await rag.aquery_llm(
            query,
            param=QueryParam(mode="hybrid", only_need_context=True, top_k=k)
        )
        return res

    try:
        query_res = asyncio.run(run_query())
    except Exception as e:
        print(f"Error querying LightRAG: {e}")
        return []

    data = query_res.get("data", {})
    chunks = data.get("chunks", [])
    
    results = []
    for idx, chunk in enumerate(chunks[:k]):
        chunk_content = chunk.get("content", "")
        doc_id, title, category, content = parse_retrieved_chunk(chunk_content)
        
        # Calculate pseudo relevance score based on index
        results.append({
            "id": doc_id,
            "title": title,
            "category": category,
            "content": content,
            "relevance_score": round(1.0 - idx * 0.05, 4)
        })

    return results


def ensure_index_exists() -> None:
    """Auto-build LightRAG index from RAG documents if missing."""
    if not os.path.exists(INDEX_PATH):
        rag_path = "data/rag_documents.json"
        if not os.path.exists(rag_path):
            print("RAG documents not found. Run: python data/generate_data.py")
            return
        with open(rag_path, encoding="utf-8") as f:
            docs = json.load(f)
        build_vector_store(docs)


def rebuild_index() -> None:
    """Force rebuild — useful when documents are updated."""
    if os.path.exists(WORKING_DIR):
        try:
            shutil.rmtree(WORKING_DIR)
        except Exception as e:
            print(f"Warning: could not delete working dir: {e}")
    ensure_index_exists()