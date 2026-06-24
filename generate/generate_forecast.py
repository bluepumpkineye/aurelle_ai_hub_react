import json
from utils.vector_store import search_vector_store
from utils.llm_client import chat_completion, DEFAULT_MODEL

def generate_forecast_brief(data_dict: dict, model: str = None) -> str:
    """
    Generate an executive supply planning and forecast brief using RAG context and the LLM.
    """
    if model is None:
        model = DEFAULT_MODEL

    # 1. RAG Retrieval
    queries = [
        "demand forecasting supply planning APAC",
        "replenishment lead time Switzerland Singapore",
        "emergency stock request VIC sales closure",
        "seasonal demand luxury watches APAC markets",
        "allocation optimizer protocol boutique tier"
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
        "You are the APAC Demand Planning Director for Aurelle, presenting a forward supply plan "
        "to the Regional VP of Supply Chain and Market Directors. Your output is analytical, "
        "forward-looking, and highly specific. You flag risks early. You recommend actions before problems "
        "become crises. You quantify everything in units and USD. You know that a stockout on a hero SKU "
        "is not just a lost sale — it is a broken VIC promise. You speak in sophisticated business terms and cite policies.\n\n"
        "CRITICAL RULES & CONSTRAINTS:\n"
        "- Minimum 600 words. Maximum 900 words.\n"
        "- Always distinguish clearly between confirmed supply and at-risk supply.\n"
        "- Never recommend emergency requests without citing DOC-004 and confirming the VIC sales closure criterion.\n"
        "- If the supply gap can be resolved by reallocation from a surplus market, recommend this first before proposing new stock requests.\n"
        "- Quantify the commercial impact of any stockout in USD (gap units x average unit cost/selling price).\n"
        "- Be highly specific about lead times (e.g. 'Switzerland 5-21 days', 'Singapore DC 3-5 days'). Never use vague words like 'soon' or 'shortly'.\n"
        "- Only reference SKUs, boutique names, and figures present in the input data. Do not fabricate names."
    )

    # Format input data
    input_data_str = json.dumps(data_dict, indent=2)

    user_prompt = f"""
Below is the RAG policy context and the forward demand and supply forecasting data summary. Generate the Supply Plan & Forecast Brief following the required structure.

--- RAG POLICY CONTEXT ---
{context_str}

--- FORWARD FORECASTING & PIPELINE SUMMARY ---
{input_data_str}

--- REQUIRED OUTPUT STRUCTURE ---
### SUPPLY PLAN & FORECAST BRIEF
#### [SKU / Collection Filter] · [Market Filter] · {data_dict.get('forecast_horizon_days', 90)}-Day Horizon

**FORECAST SUMMARY**
[Provide a 2-3 sentence overview of total forecast demand, available supply, net gap, risk level, and stockout risk date if applicable. Quantify the revenue/capital at risk from the gap in USD.]

**SEASONALITY & DEMAND DRIVERS**
[Explain month-specific events driving demand changes and their magnitude. If seasonality is toggled off, explain that base velocity is used but note upcoming events.]

**SUPPLY PIPELINE ASSESSMENT**
[Review inbound shipments in transit or ordered. Distinguish between confirmed shipments and at-risk shipments (customs hold, delayed). Quantify impact if at-risk shipments are delayed further. Calculate the confirmed vs optimistic gap.]

**RISK ASSESSMENT**
[Provide a market-specific assessment of boutiques with material stockout risks. For each: list current stock, forecast demand, inbound status, expected stockout date, and commercial impact (VIC waitlists, event coverage, revenue at risk).]

**SCENARIO RECOMMENDATION**
[If a scenario was modelled, assess the reallocation and recommend whether to proceed, modify, or seek alternatives. If no scenario was modelled, recommend the most appropriate action from: inter-boutique transfer, emergency request, scheduled replenishment, or monitoring.]

**REPLENISHMENT PLAN — RECOMMENDED ACTIONS**
[A markdown table with 6 columns: Action | Owner | By When | Units | Expected Arrival | Impact. Minimum 4, maximum 6 actions. Include lead times (e.g., Switzerland 5-21 days, Singapore DC 3-5 days). Cite DOC-004 for emergency requests.]
| Action | Owner | By When | Units | Expected Arrival | Impact |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

**FORWARD RISK CALENDAR**
[A text-based timeline highlighting key risk dates, inbound arrival dates, seasonality events, and checkpoints over the forecast horizon. Format as:]
- WEEK 1–2 [Date Range]: [Event or risk description]
- WEEK 3–4 [Date Range]: [Event or risk description]
- WEEK 5–6 [Date Range]: [Event or risk description]
- WEEK 7–8 [Date Range]: [Event or risk description]
- WEEK 9+ [Date Range]: [Event or risk description]

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
