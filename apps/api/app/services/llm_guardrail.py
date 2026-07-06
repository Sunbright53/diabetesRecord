"""
LLM Safety Guardrail for Cheewarun AI Coach.

Implements content filtering for medical advice, drug recommendations,
and dangerous health claims. Required per NSC Judge #7 evaluation criteria.

All AI responses must include the DISCLAIMER_TH footer.
"""
from __future__ import annotations

import re

# ─── Medical content categories that must be blocked ─────────────────────────

BANNED_PATTERNS = [
    # Drug / medication recommendations
    r"\b(insulin\s*dose|metformin|ozempic|wegovy|saxenda|victoza|jardiance|januvia|glipizide|glibenclamide|acarbose)\b",
    r"\b(ให้ฉีด|ปรับยา|ลดยา|เพิ่มยา|หยุดยา|เปลี่ยนยา)\b",
    r"\b(inject|dosage adjustment|medication change|stop your medication)\b",

    # Specific diagnosis
    r"\b(คุณเป็นเบาหวาน|diagnosed with diabetes|you have diabetes|you are diabetic)\b",
    r"\b(DKA|diabetic ketoacidosis\s*confirmed)\b",

    # Emergency mismanagement
    r"\b(ไม่ต้องไปหาหมอ|don't need a doctor|no need for medical attention)\b",

    # Weight-loss extremes
    r"\b(อดอาหาร\s*\d+\s*วัน|fast for \d+ days|VLCD|very low calorie)\b",

    # Self-harm triggers
    r"\b(ทำร้ายตัวเอง|suicide|self.harm|cut yourself)\b",
]

_COMPILED = [re.compile(p, re.IGNORECASE | re.UNICODE) for p in BANNED_PATTERNS]

DISCLAIMER_TH = (
    "\n\n---\n"
    "⚠️ **ข้อมูลนี้เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์**  \n"
    "ปรึกษาแพทย์หรือผู้เชี่ยวชาญด้านสุขภาพก่อนปรับเปลี่ยนพฤติกรรมหรือการรักษา"
)

DISCLAIMER_EN = (
    "\n\n---\n"
    "⚠️ **For educational purposes only. Not medical advice.**  \n"
    "Consult a qualified healthcare professional before making any health decisions."
)


def is_refusal_needed(user_message: str) -> tuple[bool, str]:
    """
    Check whether a user message should trigger a refusal.

    Returns (should_refuse: bool, reason: str).
    reason is empty string when should_refuse=False.
    """
    for pattern in _COMPILED:
        if pattern.search(user_message):
            return True, f"Matched safety pattern: {pattern.pattern[:60]}"
    return False, ""


def sanitise_response(llm_response: str, lang: str = "th") -> str:
    """
    Post-process an LLM response:
    1. Remove any leaked banned phrases
    2. Append mandatory disclaimer
    """
    for pattern in _COMPILED:
        llm_response = pattern.sub("[ข้อมูลนี้ถูกซ่อนด้วยระบบความปลอดภัย]", llm_response)

    disclaimer = DISCLAIMER_TH if lang == "th" else DISCLAIMER_EN
    if disclaimer.strip() not in llm_response:
        llm_response += disclaimer

    return llm_response


def build_refusal_response(lang: str = "th") -> str:
    if lang == "th":
        return (
            "ขอโทษค่ะ คำถามนี้เกี่ยวกับการรักษาทางการแพทย์เฉพาะบุคคล "
            "ซึ่ง Cheewarun ไม่สามารถให้คำแนะนำได้ "
            "กรุณาปรึกษาแพทย์หรือผู้เชี่ยวชาญด้านสุขภาพโดยตรง"
            + DISCLAIMER_TH
        )
    return (
        "I'm sorry, this question involves specific medical treatment "
        "which Cheewarun cannot advise on. "
        "Please consult a qualified healthcare professional directly."
        + DISCLAIMER_EN
    )


# ─── System prompt template for MCP / LLM calls ──────────────────────────────

SYSTEM_PROMPT_TEMPLATE = """You are Cheewarun AI Coach — a wellness assistant specialising in ketogenic lifestyle, intermittent fasting, and metabolic health monitoring.

ROLE:
- Explain sensor readings and trends in plain Thai (or English if asked)
- Provide evidence-based nutrition and exercise guidance
- Encourage healthy habits aligned with the user's goal_type

STRICT RULES (never break these):
1. Never prescribe or recommend specific medications or dosages
2. Never diagnose the user with any disease
3. Never tell a user they do not need to see a doctor
4. Always end every response with the disclaimer: "{disclaimer}"
5. If asked about emergency symptoms (chest pain, extreme thirst + confusion), immediately say: "โปรดโทร 1669 หรือไปห้องฉุกเฉินทันที"

USER CONTEXT:
{user_context}

RECENT SENSOR DATA:
{sensor_data}

REASONING FLOW:
1. Acknowledge the reading in plain language
2. Compare to reference ranges: low (<30 ppm) / moderate (30–74 ppm) / high (≥75 ppm)
3. Identify 1–2 actionable lifestyle suggestions
4. Note any data quality concerns (low quality_score, needs recalibration)
5. Append disclaimer
"""

def build_system_prompt(user_context: dict, sensor_data: dict) -> str:
    import json
    return SYSTEM_PROMPT_TEMPLATE.format(
        disclaimer=DISCLAIMER_TH.strip(),
        user_context=json.dumps(user_context, ensure_ascii=False, indent=2),
        sensor_data=json.dumps(sensor_data, ensure_ascii=False, indent=2),
    )
