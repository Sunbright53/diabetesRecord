"""
LLM Safety Guardrail for Cheewarun AI Coach.

Implements content filtering for medical advice, drug recommendations,
and dangerous health claims. Required per NSC Judge #7 evaluation criteria.

All AI responses must include the DISCLAIMER_TH footer.
"""
from __future__ import annotations

import re

# ─── Medical content categories that must be blocked ─────────────────────────
# NOTE on \b (word boundary):
#   Python's re treats Thai characters as \w, so a \b requires a transition
#   between Thai (word) and space/punctuation (non-word). Thai is written
#   without spaces between words, so \b usually FAILS inside Thai sentences.
#   → Thai patterns must NOT use \b. English patterns can keep \b safely.

BANNED_PATTERNS_EN = [
    # Drug names + dose/injection words
    r"\b(insulin|metformin|ozempic|wegovy|saxenda|victoza|jardiance|januvia|glipizide|glibenclamide|acarbose)\b.*\b(dose|dosage|adjust|change|inject|amount|how much|how many)\b",
    r"\b(dose|dosage)\s*adjust(ment)?\b",
    r"\b(medication|meds?)\s*(change|adjust|stop)\b",
    r"\b(stop|adjust|change)\s+your\s+(medication|meds?|dose|dosage)\b",
    r"\b(inject\s+(more|less|extra))\b",
    r"\b(ozempic|wegovy|saxenda|victoza|jardiance|januvia|glipizide|glibenclamide|metformin)\b",

    # Diagnosis
    r"\b(you\s+(have|are)|diagnosed\s+with)\s+(diabet(es|ic)|prediabetes|DKA|ketoacidosis)\b",
    r"\bDKA\b",
    r"\bdiabetic\s+ketoacidosis\b",

    # Denying medical need
    r"\b(don't|do\s+not|no)\s+need\s+(a\s+)?(doctor|medical\s+attention|physician|hospital)\b",

    # Extreme fasting
    r"\bfast(ing)?\s+for\s+\d+\s+days?\b",
    r"\bVLCD\b|\bvery\s+low\s+calorie\b",

    # Self-harm
    r"\bsuicide\b|\bself.?harm\b|\bkill\s+(myself|yourself)\b",
    r"\b(cut|hurt)\s+(myself|yourself)\b",
    r"\bi\s+want\s+to\s+die\b",
]

# Thai — no \b (Thai has no inter-word spaces)
BANNED_PATTERNS_TH = [
    # Drug / dose / injection recommendations
    r"(ให้ฉีด|ปรับยา|ลดยา|เพิ่มยา|หยุดยา|เปลี่ยนยา|เปลี่ยนขนาดยา|ปรับขนาดยา)",
    r"ฉีด\s*(insulin|อินซูลิน|ยา)",
    r"(insulin|อินซูลิน|metformin|เม็ทฟอร์มิน).{0,15}(เท่าไหร่|เท่าไร|กี่|ขนาด|dose)",

    # Diagnosis (patient asking for verdict)
    r"(คุณเป็นเบาหวาน|ฉันเป็นเบาหวาน|เป็นเบาหวานไหม|ผมเป็นเบาหวาน|หนูเป็นเบาหวาน)",
    r"(เป็น\s*DKA|เป็น\s*ketoacidosis|ฉันเป็น\s*DKA)",

    # Denying medical need
    r"(ไม่ต้องไปหาหมอ|ไม่ต้องพบแพทย์|ไม่ต้องปรึกษาแพทย์|ไม่จำเป็นต้องไปหาหมอ)",

    # Extreme fasting
    r"อดอาหาร\s*\d+\s*วัน",
    r"ไม่กิน(อะไร)?\s*\d+\s*วัน",

    # Self-harm
    r"(ทำร้ายตัวเอง|อยากตาย|อยากฆ่าตัวตาย|ฆ่าตัวตาย|จบชีวิต)",
]

BANNED_PATTERNS = BANNED_PATTERNS_EN + BANNED_PATTERNS_TH

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
