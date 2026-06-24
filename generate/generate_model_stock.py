import json
from utils.vector_store import search_vector_store
from utils.llm_client import chat_completion, DEFAULT_MODEL

def generate_model_stock_brief(data_dict: dict, model: str = None) -> str:
    """
    Generate an executive model stock brief using RAG context and the LLM.
    """
    if model is None:
        model = DEFAULT_MODEL

    # 1. RAG Retrieval
    queries = [
        "supply chain allocation policy APAC",
        "emergency stock request procedure boutique",
        "model stock inventory management luxury",
        "boutique tier allocation priority"
    ]
    
    rag_chunks = []
    seen_ids = set()
    doc_references = []
    
    for q in queries:
        try:
            results = search_vector_store(q, k=2)
            for res in results:
                doc_id = res.get("id")
                if doc_id not in seen_ids:
                    seen_ids.add(doc_id)
                    rag_chunks.append(res)
                    doc_references.append(f"{res.get('title', 'Policy Document')} (ID: {doc_id})")
        except Exception as e:
            print(f"Error searching vector store for '{q}': {e}")

    # Format RAG context for prompt
    context_str = ""
    for idx, chunk in enumerate(rag_chunks):
        context_str += f"[{idx+1}] Document: {chunk.get('title')} (ID: {chunk.get('id')})\nContent: {chunk.get('content')}\n\n"

    # 2. Build Prompts
    system_prompt = (
        "You are the VP of Supply Chain for Aurelle APAC, presenting the weekly model stock review "
        "to the regional planning team and Market Directors. Your output must be precise, "
        "commercially grounded, and action-oriented. You speak in sophisticated business terms, not technical ones. "
        "You cite policy documents and ID numbers when recommending actions.\n\n"
        "CRITICAL RULES & CONSTRAINTS:\n"
        "- Minimum 500 words. Maximum 800 words.\n"
        "- Never recommend discounting to clear over-stock. Discounting is strictly prohibited.\n"
        "- Always recommend reallocation from over-stocked boutiques before making new stock requests.\n"
        "- Emergency stock requests must explicitly reference the DOC-004 protocol and the criteria for VIC sales closure.\n"
        "- Cite document ID numbers (e.g., DOC-004) when referring to policy guidelines.\n"
        "- Only reference SKUs, boutique names, and figures present in the input data. Do not fabricate names."
    )

    # Format input data
    input_data_str = json.dumps(data_dict, indent=2)

    user_prompt = f"""
Below is the RAG policy context and the weekly model stock data summary. Generate the Model Stock Brief following the required structure.

--- RAG POLICY CONTEXT ---
{context_str}

--- WEEKLY MODEL STOCK DATA SUMMARY ---
{input_data_str}

--- REQUIRED OUTPUT STRUCTURE ---
### MODEL STOCK INTELLIGENCE BRIEF
#### [Region/Filter Summary] · As of {data_dict.get('as_of_date', 'Today')}

**REGIONAL HEALTH ASSESSMENT**
[Provide a 2-3 sentence overview of the regional model stock achievement percentage, recent trends, and major exposure areas.]

**CATEGORY PRIORITIES**
[Detail category-specific achievements and priorities for Watches, Fine Jewellery, and High Jewellery. Quantify gaps in units and USD, naming specific collections at risk.]

**CRITICAL GAPS — IMMEDIATE ACTION REQUIRED**
[Numbered list of the top 5 critical SKU x boutique gaps. For each item, state: reference SKU/name, boutique, gap size, urgency reason, and the recommended action. Cite DOC-004 where emergency request protocols are applicable.]

**OVER-STOCK REVIEW**
[Review over-stocked positions. Recommend specific inter-boutique reallocations to cover gaps before requesting new factory shipments. Flag capital tied up in excess.]

**BOUTIQUE TIER OBSERVATIONS**
[Analyze performance across Flagship Maisons, Flagships, Standard, and Emerging boutiques. Comment on how each tier is performing and if any tier is dragging the average.]

**RECOMMENDED ACTIONS THIS WEEK**
[A markdown table with 4 columns: Action | Owner | Deadline | Expected Impact. Minimum of 4 specific, owner-assigned actions. Formatted cleanly.]
| Action | Owner | Deadline | Expected Impact |
|---|---|---|---|
| ... | ... | ... | ... |

**POLICY REFERENCES**
[List the RAG policy documents cited in the brief with their document IDs.]
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    # 3. LLM Call
    try:
        response = chat_completion(
            messages=messages,
            model=model,
            temperature=0.4,
            max_tokens=1500
        )
        return response
    except Exception as e:
        return f"⚠️ Failed to generate brief: {e}"
