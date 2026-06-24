"""
Shared presentation helpers that carry the business-value story.

These centralize three things the product was missing:
  1. A single on-brand "AI insight" card (replacing the off-theme dark boxes).
  2. A consistent way to surface *value at stake* and *recommended actions*
     alongside every number — so the UI sells outcomes, not prose.
  3. A visible trust signal showing which AI engine answered (primary vs.
     automatic fallback), turning the resilient routing into a feature.
"""

import streamlit as st

GOLD   = "#C5A028"
INK    = "#1C1C1C"
MUTED  = "#6B6B6B"
CREAM  = "#FAF8F5"


def fmt_usd(value: float) -> str:
    """Compact, executive-friendly USD formatting ($1.2M, $940K, $820)."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "—"
    sign = "-" if v < 0 else ""
    v = abs(v)
    if v >= 1e9:
        return f"{sign}${v/1e9:.1f}B"
    if v >= 1e6:
        return f"{sign}${v/1e6:.1f}M"
    if v >= 1e3:
        return f"{sign}${v/1e3:.0f}K"
    return f"{sign}${v:,.0f}"


def engine_caption() -> str:
    """Human label for the AI engine that produced the last response."""
    provider = st.session_state.get("llm_last_provider")
    model    = st.session_state.get("llm_last_model")
    if not provider:
        return "AI engine"
    label = {"openai": "OpenAI", "xai": "xAI"}.get(provider, provider.title())
    tag = "Fallback engine" if st.session_state.get("llm_used_fallback") else "Primary engine"
    return f"{tag} · {label} {model}"


def value_callout(label: str, amount, sublabel: str = "", tone: str = "neutral") -> None:
    """
    A single 'value at stake / opportunity' tile — a headline money figure
    with a one-line consequence. Tones: 'risk' (red), 'opportunity' (gold),
    'positive' (green), 'neutral' (ink).
    """
    colors = {
        "risk":        "#8B0000",
        "opportunity": GOLD,
        "positive":    "#5C7A5C",
        "neutral":     INK,
    }
    accent = colors.get(tone, INK)
    money = amount if isinstance(amount, str) else fmt_usd(amount)
    st.markdown(
        f"""
        <div style="background:#FFFFFF;border-top:2px solid {accent};
                    padding:18px 18px 16px 18px;height:100%;
                    box-shadow:0 1px 6px rgba(0,0,0,0.04);">
            <div style="font-family:'Jost',sans-serif;font-size:10px;font-weight:600;
                        letter-spacing:2px;text-transform:uppercase;color:{MUTED};">
                {label}
            </div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:2rem;
                        font-weight:300;color:{accent};line-height:1.1;margin-top:6px;">
                {money}
            </div>
            <div style="font-family:'Jost',sans-serif;font-size:11px;color:{MUTED};
                        margin-top:6px;line-height:1.5;">
                {sublabel}
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_ai_insight(body: str, title: str = "AI Intelligence",
                      action: str = "", show_engine: bool = True) -> None:
    """
    Render an AI response as an on-brand light card with proper markdown,
    an optional 'Recommended action' strip, and the engine trust caption.

    Replaces the legacy dark `#1A1A1A` boxes used across modules.
    """
    failed = isinstance(body, str) and body.lstrip().startswith("⚠️")
    accent = "#8B0000" if failed else GOLD

    st.markdown(
        f"""
        <div style="background:linear-gradient(90deg,{accent} 0%,{accent} 3px,#FFFFFF 3px,#FFFFFF 100%);
                    border:1px solid #E8E0D0;border-bottom:none;
                    padding:14px 20px;display:flex;align-items:center;gap:10px;">
            <span style="color:{accent};font-size:13px;">◆</span>
            <span style="font-family:'Jost',sans-serif;font-size:11px;font-weight:600;
                         letter-spacing:2px;text-transform:uppercase;color:{INK};">
                {title}
            </span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    with st.container(border=True):
        st.markdown(body)
        if action and not failed:
            st.markdown(
                f"""
                <div style="border-left:2px solid {GOLD};padding:6px 0 6px 12px;
                            margin-top:8px;font-family:'Jost',sans-serif;font-size:12px;
                            color:{INK};">
                    <span style="color:{MUTED};text-transform:uppercase;letter-spacing:1px;
                                 font-size:10px;font-weight:600;">Recommended action</span><br>
                    {action}
                </div>
                """,
                unsafe_allow_html=True,
            )
        if show_engine and not failed:
            st.caption(engine_caption())


def demo_ribbon(text: str = "Demonstration · illustrative synthetic data") -> None:
    """Discreet tag clarifying this is a live prototype of a real SaaS capability."""
    st.markdown(
        f"""
        <div style="display:inline-block;font-family:'Jost',sans-serif;font-size:9px;
                    letter-spacing:2px;text-transform:uppercase;color:{MUTED};
                    border:1px solid #E8E0D0;border-radius:0;padding:3px 10px;
                    background:#FFFFFF;">
            {text}
        </div>
        """,
        unsafe_allow_html=True,
    )
