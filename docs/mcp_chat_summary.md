# สรุประบบ MetaBreath Chat + MCP (ฉบับทำความเข้าใจ)

> commit: `f807dfe` — feat(ai): MetaBreath chat via real MCP protocol + streaming + slash prompts
> deploy: metabreath.duckdns.org (live)

---

## 1. ภาพรวมแบบสั้นสุด

ระบบ chat ของ MetaBreath ตอนนี้:

1. **AI คือ Claude Haiku 4.5** ตอบเป็นบุคลิก "MetaBreath" ผู้หญิงสุภาพ
2. **ใช้ MCP protocol จริง** (Model Context Protocol) — ไม่ใช่ tool_use เดี่ยว ๆ อีกต่อไป
3. **Streaming แบบ real-time** — พิมพ์ตอบทีละคำผ่าน SSE
4. **Slash commands** — พิมพ์ `/` เห็นเมนู template คำถาม
5. **Claude Desktop ต่อได้** ผ่าน HTTPS + JWT

---

## 2. MCP คืออะไร (ในบริบทของเรา)

**MCP = Model Context Protocol** — มาตรฐานให้ AI ต่อกับ "ข้อมูล/ฟังก์ชัน" ภายนอกได้

MCP มี **3 primitives**:

| Primitive | หน้าที่ | ของเรา |
|---|---|---|
| **Tools** | ฟังก์ชันที่ AI เรียกได้ (get / write) | 8 ตัว |
| **Resources** | ข้อมูล read-only ที่ AI อ่านได้ (เอกสาร, snapshot) | 3 ตัว |
| **Prompts** | Template คำถามที่ user เลือกได้ (slash commands) | 3 ตัว |

พูดง่าย ๆ: **Tools = ให้ AI ทำงานได้, Resources = ให้ AI อ่านเอกสารได้, Prompts = ให้ user คลิกใช้งานแทนพิมพ์**

---

## 3. ไฟล์สำคัญ (backend)

```
apps/api/app/
├── mcp_context.py         ← contextvars (user_id, db, device_id) + mcp_scope()
├── mcp_server.py          ← FastMCP instance + 8 tools + 3 resources + 3 prompts
├── main.py                ← mount /mcp + MCPAuthMiddleware (JWT validation)
├── routers/ai.py
│   ├── /ai/chat           ← non-stream (fallback)
│   ├── /ai/chat/stream    ← SSE streaming (default UI ใช้ตัวนี้)
│   └── /ai/prompts        ← list slash commands
├── services/
│   ├── chat_tools.py      ← implementation จริงของ 8 tools (DB direct)
│   └── llm_guardrail.py   ← persona/system prompt + sanitiser + refusal check
```

---

## 4. 8 Tools ที่ AI เรียกได้

| Tool | อ่าน/เขียน | ตัวอย่างเวลาใช้ |
|---|---|---|
| `get_user_profile` | read | "สรุปโปรไฟล์ฉัน" |
| `get_recent_readings` | read | "ค่าตอนนี้เป็นยังไง" |
| `get_metabolic_trend` | read | "แนวโน้ม 14 วัน" |
| `get_recent_logs` | read | "ทำไมค่าขึ้น ๆ ลง ๆ" |
| `explain_reading` | pure | "2.3 ppm หมายถึงอะไร" |
| `log_meal` | **write** | "จดว่ากินไข่ต้ม 2 ฟอง" |
| `log_activity` | **write** | "จดว่าเดิน 30 นาที" |
| `calibrate_device` | **write** | "calibrate ที่ 0.5 ppm" |

**AI จะเลือกเรียกเองตามคำถาม** — ไม่ต้องบอก "ใช้ tool X"

---

## 5. 3 Resources

URI ที่ external clients (เช่น Claude Desktop) อ่านได้:

```
metabreath://reference/acetone-ranges     — ค่าอ้างอิง 0.3-0.9 / 1-5 / 5-40 / >75
metabreath://reference/tgs1820-datasheet  — สเปคเซ็นเซอร์ TGS1820
metabreath://user/personal-snapshot       — snapshot ของ user (dynamic)
```

---

## 6. 3 Prompts (Slash commands)

| Slash | ทำอะไร |
|---|---|
| `/summary_today` | สรุปสุขภาพวันนี้ (โปรไฟล์ + ค่าล่าสุด + logs 7 วัน) |
| `/daily_coaching` | ข้อความโค้ชประจำวันตามเป้าหมาย |
| `/analyze_metabolic` | วิเคราะห์เมตาบอลิกจาก 14 วันล่าสุด |

**UI**: พิมพ์ `/` ในกล่องแชท → เมนู dropdown → คลิกเลือก → ส่งข้อความ template อัตโนมัติ

---

## 7. Flow เต็ม (step-by-step)

```
[User พิมพ์ในกล่องแชท]
      │
      ▼  POST /api/ai/chat/stream  { message, device_id }
[Web → API]  (fetch + ReadableStream — รองรับ Bearer header)
      │
      ▼
[FastAPI /ai/chat/stream]
      │
      ├─ 1. Guardrail: มีคำต้องห้ามไหม (ยา/วินิจฉัย)
      │        → มี → ส่ง event refusal + done, จบ
      │
      ├─ 2. โหลด Profile → user_context (display_name, goal_th, ...)
      │
      ├─ 3. Build system prompt (MetaBreath persona + few-shot + context)
      │
      ├─ 4. mcp_scope(user.id, device_id)  ← ตั้ง contextvars
      │        │
      │        ▼
      │   [MCP Client ในโพรเซสเดียวกัน]
      │        │
      │        ├─ list_tools()  ← ดึง 8 tool schemas จาก FastMCP
      │        │
      │        ├─ Loop สูงสุด 6 รอบ:
      │        │      │
      │        │      ├─ Anthropic client.messages.stream(...)
      │        │      │      │
      │        │      │      ├─ text delta → yield SSE event "text"
      │        │      │      └─ ครบ 1 turn → get_final_message()
      │        │      │
      │        │      ├─ stop_reason == "tool_use"?
      │        │      │      ├─ YES:
      │        │      │      │    ├─ yield SSE "tool_use"
      │        │      │      │    ├─ mcp_server.call_tool(name, args)
      │        │      │      │    │      → tool อ่าน contextvar → DB → คืนผล
      │        │      │      │    ├─ yield SSE "tool_result"
      │        │      │      │    └─ append tool_result เข้า messages, วนต่อ
      │        │      │      └─ NO: break
      │        │      │
      │        └─ ออกจาก scope (contextvars reset)
      │
      ├─ 5. Sanitize: ตัด disclaimer ที่ AI เขียนเอง + append canonical
      │        → yield SSE event "text" ปิดท้าย
      │
      └─ yield SSE event "done" → ปิด stream
             │
             ▼
[Web chat/page.tsx]
      │
      ├─ ReadableStream + SSE parser
      ├─ event "text" → ต่อ delta เข้า assistant message
      ├─ event "tool_use" → แสดง "กำลังดึงข้อมูล: <name>"
      ├─ event "tool_result" → ซ่อน status
      └─ event "done" → ปิด loading
```

---

## 8. Auth (สองเส้นทาง)

**เส้นที่ 1 — Chat ในเว็บ (/ai/chat/stream)**
- Frontend ส่ง `Authorization: Bearer <access_token>`
- FastAPI `Depends(get_current_user)` → ได้ `user` object
- `mcp_scope(user.id)` → ตั้ง contextvar → tools อ่านได้

**เส้นที่ 2 — External MCP client (/mcp/*)**
- Client ส่ง `Authorization: Bearer <access_token>` + optional `X-MetaBreath-Device-Id`
- `MCPAuthMiddleware` (ใน `main.py`) validate JWT → สร้าง DB session → ตั้ง contextvar
- FastMCP ASGI handle request → tools อ่าน contextvar

**Config Claude Desktop ตัวอย่าง**:
```json
{
  "mcpServers": {
    "metabreath": {
      "url": "https://metabreath.duckdns.org/api/mcp/",
      "headers": { "Authorization": "Bearer <JWT>" }
    }
  }
}
```

---

## 9. Persona (MetaBreath)

**บุคลิก**: ผู้หญิง สุภาพ อบอุ่น เหมือนเพื่อนที่มีความรู้ — ตอบภาษาไทย

**กฎสำคัญ** (บังคับใน system prompt):
- ห้ามวินิจฉัยโรค → พูดว่า "ค่ากำลังชี้ไปทาง..." แทน
- ห้ามแนะนำยา / ปรับขนาดยา
- ห้ามพูดว่า "ไม่ต้องไปหาหมอ"
- อาการฉุกเฉิน → บอกโทร 1669 ทันที
- ห้ามใส่ disclaimer เอง (backend append ให้)
- ห้ามใช้ตาราง (`|`) หรือหัวข้อ (`###`) ในการแชท
- ห้ามใช้คำซ้ำติดกัน (เช่น "ลองลอง")
- แปล goal_type เป็นไทย (monitor → ติดตามสุขภาพ)
- ห้ามเปิดคำตอบด้วย profile stats ยกเว้นถูกขอตรง ๆ

**ตัวอย่างโทน (few-shot ใน prompt)**:
- "ค่า acetone ตอนนี้เป็นยังไง" → "ค่าล่าสุดอยู่ที่ **2.3 ppm** ถือว่าเริ่มเข้าโหมดเผาไขมันแล้วค่ะ..."
- "กินอะไรดีตอนเช้า" → ไม่ recap โปรไฟล์ ตอบตรงประเด็น

---

## 10. Frontend

### หน้า chat (`apps/web/src/app/(app)/chat/page.tsx`)

- ใช้ `api.ai.chatStream()` แทน `api.ai.chat()`
- Render assistant messages ด้วย `react-markdown` + `remark-gfm`
- แสดง typing indicator + tool status ("กำลังดึงข้อมูล: get_recent_readings")
- Slash menu โผล่เมื่อพิมพ์ `/` ต้นข้อความ

### SSE parser (`apps/web/src/lib/api.ts` — `chatStream`)

- `fetch()` → `response.body.getReader()`
- อ่านทีละ chunk → decode → parse SSE frames (คั่นด้วย `\n\n`)
- แต่ละบรรทัดขึ้นด้วย `data:` → JSON.parse → callback

---

## 11. คำสั่งที่ใช้บ่อย

**ดู logs API บน server**:
```bash
ssh root@metabreath.duckdns.org "docker compose -f /root/cheewarun/docker-compose.yml logs -f api"
```

**Deploy ใหม่ (API)**:
```bash
rsync -avz --delete --exclude '__pycache__' --exclude '*.pyc' \
  apps/api/app/ root@metabreath.duckdns.org:/root/cheewarun/apps/api/app/
ssh root@metabreath.duckdns.org "cd /root/cheewarun && docker compose up -d --build api worker beat"
```

**Deploy ใหม่ (Web)**:
```bash
rsync -avz apps/web/src/ root@metabreath.duckdns.org:/root/cheewarun/apps/web/src/
ssh root@metabreath.duckdns.org "cd /root/cheewarun && docker build -t cheewarun-web:latest apps/web/ && docker compose up --no-build -d web"
```

**ยิงลอง MCP endpoint (ต้องมี JWT ก่อน)**:
```bash
curl -X POST https://metabreath.duckdns.org/api/mcp/ \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## 12. Trade-offs ที่ตัดสินใจ

| ประเด็น | เลือกอะไร | ทำไม |
|---|---|---|
| Transport ใน chat | in-process MCP client | Latency ~0, ไม่ต้อง HTTP hop |
| Transport ภายนอก | Streamable HTTP (mounted /mcp) | Claude Desktop รองรับ |
| SDK version | mcp==1.9.4 | รองรับ FastMCP + streamable_http |
| Streaming | SSE (fetch+ReadableStream) | รองรับ Bearer header ได้ (ต่าง EventSource) |
| System prompt แบบ persona | ใน `llm_guardrail.py` | รวมกับ guardrail rules ที่ที่เดียว |
| Disclaimer | backend append ครั้งเดียว | AI พลาดใส่เอง = ตัดออก + คืน canonical |

---

## 13. ที่ยังทำได้อีก (future)

- **Keyboard nav** ใน slash menu (ลูกศร + Enter)
- **Multi-turn conversation history** (ตอนนี้แชทเป็น per-message ไม่มี memory ข้ามข้อความ) — ต้องเก็บใน DB
- **Resource browsing UI** — ให้ user เปิดดู personal-snapshot ตรง ๆ ได้
- **MCP prompts args** — ตอนนี้ prompts รับ arg 0 ตัว ถ้าเพิ่ม arg ต้องปรับ UI ให้กรอก
- **Parallel tool calls** — ตอนนี้ tool_use ใน 1 รอบวนเรียงลำดับ ถ้า model ขอ 3 tools พร้อมกัน จะได้ speed ขึ้นถ้าเรียกขนาน

---

## 14. TL;DR

> Chat ในเว็บ = FastAPI → in-process MCP client → FastMCP (8 tools + 3 resources + 3 prompts) → Anthropic streaming → SSE ออกไป web → react-markdown render.
> ตัว MCP เดียวกันเปิดที่ `/mcp` ให้ Claude Desktop ต่อผ่าน HTTPS + JWT ได้ด้วย.
> Persona MetaBreath อยู่ใน `llm_guardrail.py:SYSTEM_PROMPT_TEMPLATE` — แก้ที่นั่นถ้าจะปรับโทน.
