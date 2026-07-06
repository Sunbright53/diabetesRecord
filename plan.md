# Cheewarun (ชีวารุณ) — Migration Plan

> **Cheewarun** = ชีวา (ชีวิต) + อรุณ (รุ่งอรุณ) → "รุ่งอรุณแห่งชีวิต"
> Wellness companion สำหรับสาย keto / IF / exercise / ติดตามสุขภาพ

- **สร้างแผน**: 2026-07-04 (เสาร์) เวลา 11:15 ICT
- **แก้ไขล่าสุด**: 2026-07-04 11:45 ICT
- **เจ้าของ**: Pranai (plaiad.innovation@gmail.com)
- **VPS ปลายทาง**: 45.136.236.57 (Ubuntu 22.04, 3 vCPU, 7.8 GiB RAM, 194 GB disk)
- **Domain (ชั่วคราว)**: `cheewarun.duckdns.org` (Let's Encrypt via certbot — ฟรีถาวร) → ซื้อ .com/.co.th ทีหลัง
- **สถานะปัจจุบัน**: index.html เดียว 4,319 บรรทัด (Firebase + MQTT + Chart.js)
- **เป้าหมาย**: ย้ายเป็น web app แยกชั้น + Docker + UI/UX ใหม่ + gamification/social

> 📎 **Companion plan**: [`plan_metabreath.md`](plan_metabreath.md) — แผน NSC alignment (Phase 5/6 ปรับใหม่ตาม Judge Comments + pilot study + MCP + LSTM)

> วิธีใช้ไฟล์นี้: แต่ละ Phase ระบุช่วงวันที่ + checkbox ให้ tick ทีละอัน. เวลาสั่งงานผมให้อ้าง "ทำ Phase 1 ข้อ 3" ก็ได้.

---

## 0. VPS Audit (ผลการสำรวจ 2026-07-04 11:12 ICT)

**สิ่งที่มีอยู่แล้วบนเครื่อง**
- Docker 29.5.1 + Compose v5.1.3 ✓
- Host **nginx** เป็น reverse proxy หลัก (port 80/8080/8082)
  - `plaiad.com`, `www.plaiad.com`, `45.136.236.57` → 3000 (PM2 next.js `plaiad-web`) + 8000 (`plaiad-fastapi`)
  - อื่น ๆ: coachly (3001), bright-studio, reporiz (4001, 5174)
- Port 443 ถูก `trigger-finger-exercise-caddy` container ครอง
- ประจำการอยู่ 17 containers, uptime 5–12 วัน
- RAM ใช้ไป ~6.5 GiB / 7.8 GiB ; llama-server กิน 2.1 GiB
- ไม่มี directory `/root/diabetesRecord` (ยังไม่เริ่ม)

**ข้อจำกัดที่ต้องปฏิบัติตาม**
1. ❌ ห้าม bind port 80/443/8080/8082 (ชนของเดิม)
2. ❌ ห้ามลง Caddy ของเราเอง — piggyback nginx โฮสต์แทน
3. ⚠️ ทุก service ต้อง `bind: 127.0.0.1:xxxx` เท่านั้น (ยกเว้นที่จงใจเปิดออก)
4. ⚠️ RAM budget รวมทั้ง stack ใหม่ ≤ 1.2 GiB
5. ✓ ใช้ nginx host proxy_pass เข้ามา → เพิ่มไฟล์ `/etc/nginx/sites-enabled/diabetes`

---

## 1. Port allocation (จองล่วงหน้า)

ทุก port bind `127.0.0.1` ทั้งหมด, exposed ผ่าน host nginx เท่านั้น

| Service | Host port | Container port | หมายเหตุ |
|---|---|---|---|
| web (Next.js)     | 3010 | 3000 | nginx proxy `/` |
| api (FastAPI)     | 8010 | 8000 | nginx proxy `/api`, `/ws` |
| db (Postgres+Timescale) | 5440 | 5432 | dev-access เท่านั้น (host firewall block prod) |
| redis             | 6390 | 6379 | |
| mqtt broker       | 1893 (mqtt) / 9010 (ws) | 1883 / 9001 | nginx proxy `wss://.../mqtt` → 9010 |
| minio (optional)  | 9020 | 9000 | ถ้าตัดสินใจใช้ |

**Domain plan** (ตัดสินใจแล้ว): ใช้ **DuckDNS ฟรี** → `cheewarun.duckdns.org` → ชี้ A record ไป `45.136.236.57`
- ถ้าชื่อ `cheewarun` ถูกจอง fallback: `cheewarun-app`, `cheewarun-th`, `mycheewarun`
- ในอนาคตซื้อ domain จริง (`cheewarun.com` / `.co` / `.co.th`) → แค่เปลี่ยน DNS record + nginx `server_name`

TLS: Let's Encrypt ผ่าน `certbot --nginx` บน host nginx (ไม่ต้องยุ่งกับ Caddy ตัว trigger-finger)

---

## 2. Architecture ที่ปรับแล้ว

```
[Internet]
    │
    ▼
host nginx (80/443, certbot)
    │
    ├── cheewarun.duckdns.org/       → 127.0.0.1:3010  (web)
    ├── cheewarun.duckdns.org/api/*  → 127.0.0.1:8010  (api)
    ├── cheewarun.duckdns.org/ws     → 127.0.0.1:8010  (websocket upgrade)
    └── cheewarun.duckdns.org/mqtt   → 127.0.0.1:9010  (mqtt-ws for devices)

docker network: cheewarun_default (internal only)
    ┌──────────┬──────────┬──────────┬──────────┐
    │  web     │  api     │  worker  │  beat    │
    │  :3000   │  :8000   │  celery  │  scheduler│
    └────┬─────┴────┬─────┴─────┬────┴────┬─────┘
         │          │           │         │
         ▼          ▼           ▼         ▼
     db (5432)   redis (6379)   mqtt (1883/9001)
```

Stack ยืนยัน: **Next.js 15 + TS + Tailwind + shadcn/ui + Recharts + TanStack Query**
Backend: **FastAPI + SQLModel + Alembic + Celery + pywebpush**
DB: **timescale/timescaledb-ha:pg16** (มี extension พร้อม)
MQTT: **eclipse-mosquitto:2**
Auth: **FastAPI-Users** (JWT + refresh, Postgres-backed)

---

## 3. Repo structure ที่จะสร้าง

```
diabetesRecord/                  (repo root — จะ rename เป็น cheewarun ตอนขึ้น VPS)
├── plan.md                      ← ไฟล์นี้
├── README.md
├── docker-compose.yml
├── docker-compose.override.yml  (dev)
├── .env.example
├── .gitignore
├── nginx/
│   └── cheewarun.conf           (สำหรับ host nginx บน VPS)
├── mosquitto/
│   ├── mosquitto.conf
│   └── passwd
├── apps/
│   ├── web/                     Next.js 15
│   └── api/                     FastAPI + Alembic
├── packages/
│   └── shared-types/            (สร้าง Phase 2)
├── content/
│   └── articles/*.mdx
├── legacy/
│   └── index.html               ← เก็บของเดิมไว้ใน git อย่างเดียว, ไม่ deploy
├── infra/
│   ├── backup.sh
│   ├── deploy.sh
│   └── seed/
└── scripts/
    └── mqtt_simulator.py
```

**Legacy policy**: `index.html` ต้นฉบับย้ายไป `legacy/` ใน git เพื่อเป็น reference — **ไม่ deploy** ตัดขาดเลย (user เก่าเริ่มใหม่หมด)

---

## 4. Phased plan (มี date + checklist)

### Phase 0 — Setup & VPS prep
**เป้าหมาย**: repo skeleton + docker-compose รันได้ + nginx routing บน VPS
**ช่วง**: 2026-07-04 → 2026-07-11 (1 สัปดาห์)

- [x] 0.1 สร้าง git branch `rebuild` และย้าย `index.html` ปัจจุบันไป `legacy/`
- [x] 0.2 DuckDNS `cheewarun.duckdns.org` → 45.136.236.57 ✓ (verified: dig + all pages 200 via public URL)
- [x] 0.3 สร้าง repo structure ตามหัวข้อ 3
- [x] 0.4 เขียน `.env.example` + `.gitignore`
- [x] 0.5 เขียน `docker-compose.yml` ครบ 5 services (web/api/db/redis/mqtt)
- [x] 0.6 Next.js 16 scaffold (Tailwind, standalone output) + dependencies
- [x] 0.7 FastAPI scaffold (`/healthz` ✓) + requirements.txt + alembic skeleton
- [x] 0.8 rsync ส่งไป VPS `/root/cheewarun` → docker compose up → **ทุก service healthy**
      - web :3010 ✓, api :8010 ✓ (healthz), db (healthy) ✓, redis (healthy) ✓, mqtt ✓
      - RAM หลัง stack ขึ้น: used 6.3GiB / 7.8GiB (เหลือ ~1.1 GiB available — OK)
- [x] 0.9 nginx config เพิ่มแล้ว (`/etc/nginx/sites-enabled/cheewarun`) port 80 ทำงาน
      - `curl -H "Host: cheewarun.duckdns.org" http://localhost/api/healthz` → 200 ✓
      - ⚠️ port 443 conflict: `trigger-finger-exercise-caddy` ครอง 443 ด้วย TLS-ALPN-01
      - แก้ใน 0.10 พร้อมกับ DuckDNS setup
- [ ] 0.10 ยิง certbot → HTTPS ← **ต้องทำ 0.2 ก่อน** (DuckDNS) แล้วแก้ 443 conflict
- [x] 0.11 `infra/backup.sh` cron 03:00 UTC ตั้งแล้ว, test OK → `/backups/cheewarun/2026-07-04.sql.gz`
- **ส่งมอบ**: ✅ 9/11 tasks done. HTTP ใช้ได้แล้ว — รอ DuckDNS เพื่อ HTTPS

> **หมายเหตุ 443 conflict**: trigger-finger Caddy ใช้ TLS-ALPN-01 (port 443 เท่านั้น, port 80 free)
> แก้ใน step 0.10: ย้าย trigger-finger bind → `127.0.0.1:7443`, nginx รับ 443 แทน + route ทั้งสองโดเมน

### Phase 1 — Auth + Data Foundation
**ช่วง**: 2026-07-12 → 2026-07-25 (2 สัปดาห์)

- [x] 1.1 Alembic init + baseline migration ว่าง
- [x] 1.2 SQLModel: `users`, `profiles`, `questionnaires`
- [x] 1.3 SQLModel: `ketone_logs`, `weight_logs`, `meal_logs`, `activity_logs`
- [x] 1.4 SQLModel: `sensor_readings` (+ Timescale hypertable), `devices`
- [x] 1.5 SQLModel: gamification set (`xp_ledger`, `streaks`, `badges`, `user_badges`, `quests`, `quest_progress`)
- [x] 1.6 SQLModel: social (`friendships`, `friend_codes`, `challenges`)
- [x] 1.7 SQLModel: `articles`, `article_reads`, `push_subscriptions`, `reminders`, `notification_log`
- [x] 1.8 SQLModel: AI (`ai_providers`, `ai_sessions`, `ai_messages`, `ai_call_log`)
- [x] 1.9 Alembic migration + run บน VPS (ea0d46cf1085) — TimescaleDB hypertable ✓
- [x] 1.10 FastAPI auth: `/auth/register` 201 ✓, `/auth/login` ✓, `/auth/refresh` ✓, `/auth/me` ✓
- [x] 1.11 seed script: 3 ai_providers, 12 badges, 6 quest templates → Seed done ✓
- [x] 1.12 shared-types generator (openapi → ts-client) — `packages/shared-types/schema.ts` + `index.ts` ✓
- **ส่งมอบ**: ✅ **12/12 done** — auth endpoints ผ่านทุก curl test, DB live บน VPS, shared-types พร้อมใช้

### Phase 2 — Web scaffold + Onboarding + Log
**ช่วง**: 2026-07-26 → 2026-08-08 (2 สัปดาห์)

- [x] 2.1 ตั้ง Tailwind v4 theme tokens (mint/peach/off-white) + typography (Sarabun + Inter) — `globals.css` @theme block
- [x] 2.2 Custom UI: button (CVA), input, card, badge, tabs, toaster (ไม่ใช้ shadcn — built from scratch)
- [x] 2.3 Layout: sidebar desktop + bottom nav mobile (`(app)/layout.tsx`)
- [x] 2.4 หน้า `/login` `/register` — zod form, goal selector
- [x] 2.5 Wizard `/onboarding` (3 step: goal confirm / body metrics / done)
- [x] 2.6 หน้า `/home` (Today card + streak + quests placeholder + quick actions)
- [x] 2.7 หน้า `/log` tabs: Ketone / Weight / Meal / Activity — form + validation + source radio
- [x] 2.8 API endpoints: `GET/POST /logs/ketone|weight|meal|activity`, `PATCH /profile`
- [x] 2.9 หน้า `/trends` (Recharts LineChart, 7/30/90 วัน, reference line ketosis)
- [x] 2.10 Auth context (`lib/auth.tsx`) + protected route guard in `(app)/layout.tsx`
- **ส่งมอบ**: ✅ **10/10 done** — code complete; deploy ต้องใช้ `bash scripts/build-web.sh` (Docker Compose v5 bake bug workaround)

### Phase 3 — Gamification + Reminders + Content
**ช่วง**: 2026-08-09 → 2026-08-22 (2 สัปดาห์)

- [x] 3.1 XP ledger logic + api `/me/xp` — service + router ✓
- [x] 3.2 Streak calc (timezone-aware) + freeze rule — `touch_streak()` ✓
- [x] 3.3 Daily quest generator (Celery Beat 00:05) + `/me/quests/today` ✓
- [x] 3.4 Badge criteria evaluator — `evaluate_badges()` post-write hook ✓
- [x] 3.5 Level bar — CSS transition animated XP bar ใน `/me` ✓
- [x] 3.6 หน้า `/me` — XP bar + streak dots 7 วัน + badges grid ✓
- [x] 3.7 `/learn` + `/learn/[slug]` — article list + reader ✓ (markdown stored in DB)
- [x] 3.8 `/articles/{slug}/complete` → XP + quest progress + badge eval ✓
- [x] 3.9 VAPID keys + `/push/subscribe` + `/push/vapid-public` ✓
- [x] 3.10 Reminder CRUD + Celery worker `check_reminders` (60s tick) ✓
- [x] 3.11 seed 5 บทความ (keto-101, if-basics, breath-acetone, metabolic-flexibility, exercise-starter) ✓
- **ส่งมอบ**: ✅ **11/11 done** — deploy ต้องรัน migration `b3f1a2c4d5e6` + seed script ใหม่

> **Deploy checklist**:
> 1. `pip install croniter==3.0.3` (ใน requirements.txt แล้ว)
> 2. `docker compose exec api alembic upgrade head` (migration b3f1a2c4d5e6)
> 3. `docker compose exec api python /app/../infra/seed/seed.py` (seed articles)

### Phase 4 — Social + Challenge + League
**ช่วง**: 2026-08-23 → 2026-09-12 (3 สัปดาห์)

- [ ] 4.1 friend code + redeem flow
- [ ] 4.2 หน้า `/challenge` — friends list + add
- [ ] 4.3 Leaderboard weekly (Redis sorted set)
- [ ] 4.4 Challenge 1-on-1: 7-Day Ketone / Streak / XP
- [ ] 4.5 League tier + weekly cron ย้ายกลุ่ม
- [ ] 4.6 Notifications ใน-แอป (bell icon + list)
- [ ] 4.7 WebSocket manager + realtime update leaderboard/challenge
- **ส่งมอบ**: user 2 คนท้าดวลกันเห็น real-time

### Phase 5 — MQTT / Sensor integration
> ⚠️ **แบ่งย่อยเป็น 5A/5B/5C/5D ใน [plan_metabreath.md §8](plan_metabreath.md)** — ต้อง sync กับ NSC judges' comments
> เดิม 2 สัปดาห์ → ใหม่ 5A ก่อน 17 กค. (NSC), 5B–5D หลัง NSC

**สรุปสั้น** (รายละเอียดใน plan_metabreath.md):
- **5A** — Sensor data model extension + calibration + drift worker (ก่อน 17 กค.)
- **5B** — MQTT subscriber + device pairing (เดิม 5.1–5.6)
- **5C** — Pilot study support (20 คน × 5 วัน × 3 ครั้ง)
- **5D** — Calibration UI + report (สำหรับ NSC evidence)

### Phase 6 — Polish + AI + Launch
> ⚠️ **แบ่งย่อยเป็น 6A/6B/6C/6D ใน [plan_metabreath.md §8](plan_metabreath.md)** — เพิ่ม MCP + LSTM ตาม NSC requirements

**สรุปสั้น** (รายละเอียดใน plan_metabreath.md):
- **6A** — Model training notebooks (RF + XGBoost + Optuna + LSTM) with real metrics
- **6B** — Model serving (`/ai/predict`, `/ai/trend`, confidence score)
- **6C** — **MCP integration** (server + tools + resources + prompts + guardrail tests)
- **6D** — LLM coach + refusal policy + expert review

**เดิมของ Phase 6** ที่ยังคงอยู่ (คง PWA/SEO/monitoring):
- [ ] 6.6 PWA manifest + service worker (offline shell + install)
- [ ] 6.7 SEO: sitemap, meta tags, OG images (บทความ)
- [ ] 6.8 Error monitoring (self-hosted GlitchTip หรือ log-only)
- [ ] 6.9 Load test เบา (k6/vegeta 100 rps 5 นาที)
- [ ] 6.10 Docs สั้น: user guide + admin runbook

### Phase 7 — Mobile (Expo)
**ช่วง**: 2026-10-11 → เปิด
- [ ] 7.1 Expo app scaffold + reuse shared-types
- [ ] 7.2 หน้าหลัก 5 หน้า reuse component pattern
- [ ] 7.3 FCM push
- [ ] 7.4 store submission (TestFlight / Play internal)

---

## 5. Design decisions (ยืนยันแล้ว 2026-07-04 11:45 ICT)

- [x] **A. Domain** — `cheewarun.duckdns.org` ฟรีถาวร + certbot Let's Encrypt (ซื้อ .com ทีหลัง)
- [x] **B. ชื่อ product** — **Cheewarun (ชีวารุณ)** = ชีวา + อรุณ = "รุ่งอรุณแห่งชีวิต"
- [x] **C. Legacy** — เก็บใน `legacy/` ในกิต, ไม่ deploy → clean slate, ไม่ต้อง migrate user เก่า
- [x] **D. AI provider** — Auto-fallback chain: **OpenAI → Gemini → Claude**

### AI Provider chain (design)
```
┌─ POST /ai/chat ─┐
│                 │
▼                 │
try OpenAI  ─── OK ──► return + log {provider: "openai"}
   │
   ├─ (401/no-key)   ─┐
   ├─ (429 rate)     ─┤
   ├─ (5xx/timeout)  ─┤
   │                  ▼
   │             try Gemini ─── OK ──► return + log {provider: "gemini"}
   │                  │
   │                  ├─ same errors ─┐
   │                  │                ▼
   │                  │           try Claude ─── OK ──► return + log {provider: "claude"}
   │                  │                │
   │                  │                └─ ทั้งหมดล้ม ──► 503 + fallback offline tip
   └──────────────────┴────────────────┘
```
- Config table: `ai_providers` (`key`, `enabled`, `priority`, `model`, `max_tokens`)
- Admin UI (Phase 6): เปลี่ยนลำดับ + toggle enable ได้
- Log ทุก request: `ai_call_log` (provider, model, latency, tokens, cost_est, success)
- ถ้า key ของ provider ไหนไม่มี env → skip อัตโนมัติ (ไม่ error)
- Timeout ต่อ provider: 8 วิ (รวม ≤ 24 วิ)

### Branding tokens
```
Name           : Cheewarun (EN) / ชีวารุณ (TH)
Tagline        : "รุ่งอรุณของชีวิตที่แข็งแรง" / "Dawn of a stronger life"
Logo concept   : พระอาทิตย์กำลังขึ้น + ใบไม้ (sun + leaf)
Primary color  : mint-500 (#14b8a6)
Accent         : sunrise gradient (peach #fb923c → rose #f43f5e)
Vibe           : สดชื่น + มงคล + ไม่ใช่โรงพยาบาล
```

---

## 6. Runbook (ใช้ทุกครั้งที่ deploy)

```bash
# บนเครื่อง dev
git push

# บน VPS
cd /root/cheewarun
git pull

# ⚠️ Docker Compose v5 bake bug: อย่าใช้ "docker compose build web"
# ใช้สคริปต์นี้แทน (docker build โดยตรง → ไม่มี bake context)
bash scripts/build-web.sh          # build web + restart

# rebuild API / worker / beat (ยังใช้ compose ได้ปกติ)
docker compose build api
docker compose up -d api worker beat

# migrate DB
docker compose exec api alembic upgrade head

docker compose logs -f api web
```

**หมายเหตุ build-web.sh**: ทำ `docker build -t cheewarun-web:latest apps/web/` แล้ว `docker compose up --no-build -d web` — web service ใน compose.yml ใช้ `image: cheewarun-web:latest` จึงไม่ rebuild ซ้ำ

## 7. Backup
- Postgres: `pg_dump` ทุกคืน 03:00 → `/backups/cheewarun/YYYY-MM-DD.sql.gz` เก็บ 30 วัน
- MinIO/Uploads (ถ้ามี): rsync วีคลี่
- ทดสอบ restore ทุกเดือน

## 8. Metrics ที่จะติดตาม (หลัง launch)
- DAU / WAU
- % user ที่วัดคีโตน ≥ 3 ครั้ง/สัปดาห์
- avg streak
- article read completion rate
- challenge acceptance rate
- push subscribe rate

---

## Changelog แผน
- 2026-07-04 11:15 — สร้างครั้งแรก, ทำ VPS audit, ปรับ blueprint (ตัด Caddy, ใช้ host nginx แทน)
- 2026-07-04 11:45 — ยืนยัน 4 decision: ชื่อ **Cheewarun** / domain `cheewarun.duckdns.org` / legacy = keep in git / AI = auto-fallback OpenAI→Gemini→Claude
- 2026-07-04 12:30 — **Phase 0 เสร็จ 9/11 tasks**: deploy VPS ผ่าน rsync, ทุก service up, nginx port 80 routing ✓, backup cron ✓. รอ 0.2 (DuckDNS) เพื่อทำ 0.10 (HTTPS)
- 2026-07-04 (Session 2) — **Phase 1 เสร็จ 12/12**: auth endpoints ✓, Alembic+TimescaleDB ✓, seed ✓, shared-types ✓
- 2026-07-04 (Session 3) — **Phase 2 เสร็จ 10/10**: Tailwind v4 theme, UI components, login/register/onboarding/home/log/trends/me pages, log API endpoints. Docker Compose v5 bake bug workaround: ใช้ `scripts/build-web.sh` แทน `docker compose build web`
- 2026-07-06 — **Phase 3 เสร็จ 11/11**: Gamification (XP/streak/badges/quests), `/learn` articles, Celery Beat tasks, push/reminder CRUD, `/me` upgrade พร้อม level bar + badge grid. Migration `b3f1a2c4d5e6` + 5 บทความ seed พร้อม deploy
- 2026-07-06 — **NSC audit + plan_metabreath.md**: audit เทียบกับโฟลเดอร์ `แข่งชนะ by Coach Bright_NSC` พบ 4 ช่องโหว่หลัก + judges comments 9 ข้อ → สร้าง companion plan แบ่ง Phase 5/6 เป็น 5A–D + 6A–D เพื่อ deadline NSC 17 กค.
