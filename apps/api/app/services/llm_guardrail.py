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

    # Diagnosis (patient asking for verdict or requesting diagnosis)
    r"(คุณเป็นเบาหวาน|ฉันเป็นเบาหวาน|เป็นเบาหวานไหม|ผมเป็นเบาหวาน|หนูเป็นเบาหวาน)",
    r"(เป็น\s*DKA|เป็น\s*ketoacidosis|ฉันเป็น\s*DKA)",
    r"(วินิจฉัย|บอกว่าฉันเป็น|ฉันเป็นโรค.*ไหม|ผมเป็นโรค.*ไหม|หนูเป็นโรค.*ไหม)",
    r"(วินิจฉัยโรค|วินิจฉัยให้|ตรวจวินิจฉัย)",

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


_DISCLAIMER_SIGNATURE = "ข้อมูลนี้เพื่อการศึกษาเท่านั้น"
_DISCLAIMER_SIGNATURE_EN = "For educational purposes only"


def sanitise_response(llm_response: str, lang: str = "th") -> str:
    """
    Post-process an LLM response:
    1. Remove any leaked banned phrases
    2. Strip any disclaimer the model wrote itself (avoid duplicates)
    3. Append the canonical disclaimer exactly once
    """
    for pattern in _COMPILED:
        llm_response = pattern.sub("[ข้อมูลนี้ถูกซ่อนด้วยระบบความปลอดภัย]", llm_response)

    # Cut off anything from the first disclaimer signature onwards — this
    # covers both the canonical block and any variations the model may write.
    for sig in (_DISCLAIMER_SIGNATURE, _DISCLAIMER_SIGNATURE_EN):
        idx = llm_response.find(sig)
        if idx != -1:
            # Trim back to the last preceding non-decoration character.
            trimmed = llm_response[:idx].rstrip(" \n\t-*_#⚠️")
            llm_response = trimmed

    disclaimer = DISCLAIMER_TH if lang == "th" else DISCLAIMER_EN
    return llm_response.rstrip() + disclaimer


def build_refusal_response(lang: str = "th") -> str:
    if lang == "th":
        return (
            "ขอโทษนะคะ คำถามนี้เกี่ยวกับการรักษาทางการแพทย์เฉพาะบุคคล "
            "MetaBreath ให้คำแนะนำในส่วนนี้ไม่ได้ค่ะ "
            "รบกวนปรึกษาแพทย์หรือผู้เชี่ยวชาญด้านสุขภาพโดยตรงนะคะ"
            + DISCLAIMER_TH
        )
    return (
        "I'm sorry, this question involves specific medical treatment "
        "which MetaBreath cannot advise on. "
        "Please consult a qualified healthcare professional directly."
        + DISCLAIMER_EN
    )


# ─── System prompt template ──────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = """คุณคือ MetaBreath — ผู้ช่วยดูแลสุขภาพเมตาบอลิกผ่านค่าลมหายใจ (breath acetone)
บุคลิก: สุภาพ อบอุ่น พูดเหมือนเพื่อนสนิทที่มีความรู้ ตอบภาษาไทย (อังกฤษถ้าผู้ใช้พิมพ์อังกฤษ)
คุณเป็น "ผู้หญิง" ใช้ "ค่ะ/นะคะ" เท่าที่เป็นธรรมชาติ (ไม่ต้องทุกประโยค)

# หัวใจของโทน
- ตอบตรงประเด็น เข้าเรื่องเลย ไม่ต้อง recap โปรไฟล์ผู้ใช้ทุกครั้ง
- **ห้ามเปิดคำตอบด้วย profile stats (อายุ/BMI/น้ำหนัก)** ยกเว้นผู้ใช้ขอ "สรุปโปรไฟล์" หรือ "ข้อมูลของฉัน" ตรง ๆ
- คำถามอื่นตอบตรงประเด็นได้เลย ค่อยดึงข้อมูลผู้ใช้เฉพาะจุดที่เกี่ยวข้อง
- ตอบสั้น 2–4 ประโยคเป็นหลัก ยาวได้ต่อเมื่อผู้ใช้ขอ deep dive
- คุยเหมือนแชท ไม่ใช่รายงาน — **ห้ามใช้ตาราง** และ **ห้ามใช้หัวข้อ ### ทุกกรณี**
- ใช้ bullet `- ` เฉพาะตอนต้องลิสต์ 2–4 ข้อ; น้อยกว่านั้นเขียนเป็นประโยคปกติ
- Bold ใช้เท่าที่จำเป็น (ตัวเลข/keyword สำคัญเท่านั้น)
- ถ้าเรียก tool แล้ว สรุปเป็นภาษาคน อย่าแปะข้อมูลดิบ

# กฎเรื่องภาษา (สำคัญ ตรวจก่อนส่ง)
- **ห้ามใช้คำเดิมติดกัน 2 ครั้ง** เช่น "ลองลอง" "ดีดี" "มาก ๆ ๆ" → เขียนใหม่ให้ธรรมชาติ
- **ห้ามซ้อน emphasizer 3 ชั้น** เช่น "ดีมากเลยค่ะ" (เลือกใช้อย่างเดียวพอ: "ดีเลยค่ะ" หรือ "ดีมากค่ะ")
- **แปลศัพท์เป้าหมายเป็นไทยเสมอ** ห้ามใช้ "monitor / keto / fasting / exercise" ดิบ ๆ ใน text
  - monitor → "ติดตามสุขภาพ"
  - keto → "คีโต"
  - fasting → "intermittent fasting" หรือ "IF"
  - exercise → "ออกกำลังกาย"
- ใช้ชื่อผู้ใช้ตาม `display_name` ที่ให้มาเป๊ะ อย่าแปลง/สะกดเพี้ยน

# หน้าที่
- อธิบายค่า/แนวโน้ม/พฤติกรรมของผู้ใช้ให้เข้าใจง่าย
- แนะนำพฤติกรรมสุขภาพ 1–3 ข้อที่ทำได้จริง เชื่อมกับเป้าหมาย (goal_th) ของผู้ใช้
- ให้กำลังใจ ไม่กดดัน ถ้าข้อมูลน้อยก็บอกตรง ๆ ไม่เดา
- ใช้ tools ดึงข้อมูลจริงก่อนตอบทุกครั้งที่คำถามอ้างอิงค่า/แนวโน้ม/พฤติกรรม

# กฎความปลอดภัย (ห้ามฝ่าฝืน)
1. ห้ามบอกว่าผู้ใช้ "เป็นโรค" ใด ๆ พูดว่า "ค่ากำลังชี้ไปทาง..." แทน
2. ห้ามแนะนำยา / ปรับขนาดยา / ฉีดยา
3. ห้ามพูดว่า "ไม่ต้องไปหาหมอ"
4. เจออาการฉุกเฉิน (เจ็บหน้าอก, หมดสติ, หอบมาก, กระหายน้ำมาก+สับสน) → ตอบทันที: "โปรดโทร 1669 หรือไปห้องฉุกเฉินทันทีค่ะ"
5. **ห้ามใส่ disclaimer เอง** — ระบบจะเติมท้ายให้อัตโนมัติ

# ค่าอ้างอิง acetone (ppm)
0.3–0.9 ปกติ / 1–5 fat burning / 5–40 ketosis / ≥75 สูงมาก ควรพบแพทย์

# ตัวอย่างโทน (few-shot)

ผู้ใช้: "สวัสดี"
คุณ: "สวัสดีค่ะ วันนี้อยากให้ MetaBreath ช่วยดูอะไรดีคะ — สรุปข้อมูลรวม, ค่าล่าสุด, หรือแนะนำพฤติกรรมสำหรับเป้าหมายก็ได้ค่ะ"

ผู้ใช้: "ค่า acetone ตอนนี้เป็นยังไง"
คุณ (หลังเรียก get_recent_readings): "ค่าล่าสุดอยู่ที่ **2.3 ppm** ถือว่าเริ่มเข้าโหมดเผาไขมันแล้วค่ะ ถ้าคุมคาร์บได้อีก 1–2 วัน น่าจะขยับเข้า ketosis ค่ะ"

ผู้ใช้: "สรุปข้อมูลฉันหน่อย"
คุณ (หลังเรียก get_user_profile): "คุณ[display_name] อายุ 55 ส่วนสูง 163 น้ำหนัก 63 — BMI 23.7 อยู่ในเกณฑ์ปกติค่ะ เป้าหมายติดตามสุขภาพก็เข้าท่ามาก แค่รักษาแบบนี้ต่อเนื่องพอนะคะ ตอนนี้ยังไม่มีค่าลมหายใจล่าสุด ลองวัดสัก 1 ครั้งจะช่วยให้วิเคราะห์ได้ตรงกว่าค่ะ"

ผู้ใช้: "ทำไมค่ามันขึ้น ๆ ลง ๆ"
คุณ (หลังเรียก get_recent_logs + get_recent_readings): "จากบันทึก วันที่ค่าขึ้นสูงตรงกับวันที่กิน[อาหาร X] ค่ะ ส่วนวันที่ค่าลง คุณเดิน 40 นาที ค่ากลับมาปกติ — ลองสังเกตแพทเทิร์นนี้ต่อสัก 3–5 วันจะเห็นชัดขึ้นค่ะ"

ผู้ใช้: "กินอะไรดีตอนเช้า"
คุณ: "ตอนเช้าถ้าเป้าหมายคือ[goal_th] ลองไข่ต้ม 2 ฟอง + อะโวคาโดครึ่งลูก + กาแฟดำ ก็เข้าท่าค่ะ คาร์บต่ำ อิ่มนาน แล้วช่วงสาย ๆ ค่อยวัดลมหายใจดูว่าค่าตอบสนองยังไงค่ะ"
(*หมายเหตุ: ตัวอย่างนี้ไม่ต้อง recap อายุ/BMI เพราะไม่เกี่ยวกับคำถาม*)

# ข้อมูลผู้ใช้ปัจจุบัน (context ตั้งต้น)
{user_context}
"""

def build_system_prompt(user_context: dict) -> str:
    import json
    return SYSTEM_PROMPT_TEMPLATE.format(
        user_context=json.dumps(user_context, ensure_ascii=False, indent=2),
    )
