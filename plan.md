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

- [ ] 0.1 สร้าง git branch `rebuild` และย้าย `index.html` ปัจจุบันไป `legacy/`
- [ ] 0.2 สมัคร DuckDNS → จอง `cheewarun.duckdns.org` → เพิ่ม A record → 45.136.236.57
- [ ] 0.3 สร้าง repo structure ตามหัวข้อ 3 (folder ว่าง + placeholder README)
- [ ] 0.4 เขียน `.env.example` + `.gitignore` (block `.env`, `*.pem`, `mosquitto/passwd`)
- [ ] 0.5 เขียน `docker-compose.yml` ครบทุก service (yaml only, ไม่มี business logic)
- [ ] 0.6 เขียน `apps/web/Dockerfile` + Next.js scaffold ว่าง (Tailwind + shadcn init)
- [ ] 0.7 เขียน `apps/api/Dockerfile` + FastAPI scaffold ว่าง (`/healthz` เดียวก็พอ)
- [ ] 0.8 SSH เข้า VPS → `git clone` เป็น `/root/cheewarun` → `docker compose up -d` → verify containers up
- [ ] 0.9 เขียน `nginx/cheewarun.conf` → copy ไป `/etc/nginx/sites-enabled/` → `nginx -t && systemctl reload nginx`
- [ ] 0.10 ยิง `certbot --nginx -d cheewarun.duckdns.org` → verify `https://cheewarun.duckdns.org/healthz` ตอบ 200
- [ ] 0.11 ตั้ง `infra/backup.sh` cron ทุกคืน 03:00 → `/backups/cheewarun/`
- **ส่งมอบ**: URL live ที่ตอบ healthz + docker ps เห็น 6 services

### Phase 1 — Auth + Data Foundation
**ช่วง**: 2026-07-12 → 2026-07-25 (2 สัปดาห์)

- [ ] 1.1 Alembic init + baseline migration ว่าง
- [ ] 1.2 SQLModel: `users`, `profiles`, `questionnaires`
- [ ] 1.3 SQLModel: `ketone_logs`, `weight_logs`, `meal_logs`, `activity_logs`
- [ ] 1.4 SQLModel: `sensor_readings` (+ Timescale hypertable), `devices`
- [ ] 1.5 SQLModel: gamification set (`xp_ledger`, `streaks`, `badges`, `user_badges`, `quests`, `quest_progress`)
- [ ] 1.6 SQLModel: social (`friendships`, `friend_codes`, `challenges`)
- [ ] 1.7 SQLModel: `articles`, `article_reads`, `push_subscriptions`, `reminders`, `notification_log`
- [ ] 1.8 SQLModel: AI (`ai_providers`, `ai_sessions`, `ai_messages`, `ai_call_log`)
- [ ] 1.9 Alembic migration + run บน VPS
- [ ] 1.10 FastAPI-Users setup: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me`
- [ ] 1.11 seed script: badges, quest templates, ai_providers (openai=1, gemini=2, claude=3)
- [ ] 1.12 shared-types generator (openapi → ts-client)
- **ส่งมอบ**: register+login+me ผ่าน curl / Bruno collection

### Phase 2 — Web scaffold + Onboarding + Log
**ช่วง**: 2026-07-26 → 2026-08-08 (2 สัปดาห์)

- [ ] 2.1 ตั้ง Tailwind theme tokens (mint/peach/off-white) + typography (Sarabun + Inter)
- [ ] 2.2 shadcn/ui: button, input, card, dialog, tabs, sheet, toast
- [ ] 2.3 Layout: sidebar desktop / bottom nav mobile
- [ ] 2.4 หน้า `/login` `/register`
- [ ] 2.5 Wizard `/onboarding` (4 step: goal / body / schedule / device)
- [ ] 2.6 หน้า `/home` (Today card + streak + quests placeholder)
- [ ] 2.7 หน้า `/log` tabs: Ketone / Weight / Meal / Activity — form + validation
- [ ] 2.8 API endpoints `/readings/*`, `/logs/*`
- [ ] 2.9 หน้า `/trends` (Recharts, 7/30/90 วัน)
- [ ] 2.10 Auth context + protected route middleware
- **ส่งมอบ**: user register → onboarding → log ketone → เห็นค่าใน chart

### Phase 3 — Gamification + Reminders + Content
**ช่วง**: 2026-08-09 → 2026-08-22 (2 สัปดาห์)

- [ ] 3.1 XP ledger logic + api `/me/xp`
- [ ] 3.2 Streak calc (timezone-aware) + freeze rule
- [ ] 3.3 Daily quest generator (Celery Beat 00:05) + `/me/quests/today`
- [ ] 3.4 Badge criteria evaluator (post-write hook)
- [ ] 3.5 Level bar + toast/animation (Framer Motion)
- [ ] 3.6 หน้า `/me` (profile + streak calendar heatmap + badges grid)
- [ ] 3.7 MDX content pipeline (`content/articles/*.mdx`) + `/learn` + `/learn/[slug]`
- [ ] 3.8 `/articles/{slug}/complete` → +10 XP (once)
- [ ] 3.9 VAPID keys + `/push/subscribe`
- [ ] 3.10 Reminder CRUD + Celery worker `check_reminders` (1 min tick)
- [ ] 3.11 seed 5 บทความเริ่มต้น (keto 101, IF basics, exercise starter, ...)
- **ส่งมอบ**: ได้รับ web push เตือนวัดคีโตน + อ่านบทความจบได้ XP

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
**ช่วง**: 2026-09-13 → 2026-09-26 (2 สัปดาห์)
> เริ่มได้เลยเมื่อ hardware กลับมาที่คุณ

- [ ] 5.1 mosquitto.conf + user/passwd + TLS via nginx wss
- [ ] 5.2 FastAPI MQTT subscriber (asyncio-mqtt) — persistent connection
- [ ] 5.3 Device pairing flow (`/me/settings/device` → gen `mqtt_topic` + secret)
- [ ] 5.4 บันทึก reading → Timescale hypertable
- [ ] 5.5 WS push `readings:{user_id}` → dashboard realtime
- [ ] 5.6 `scripts/mqtt_simulator.py` ใช้ทดสอบตอนไม่มี hardware
- [ ] 5.7 หน้า `/trends` โชว์ VOC realtime + historical
- **ส่งมอบ**: hardware ยิงเข้ามา → เห็นค่าบน dashboard ภายใน 2 วิ

### Phase 6 — Polish + AI + Launch
**ช่วง**: 2026-09-27 → 2026-10-10 (2 สัปดาห์)

- [ ] 6.1 AI provider chain module: adapter สำหรับ OpenAI / Gemini / Claude
- [ ] 6.2 Fallback logic + circuit breaker + timeout 8s/provider
- [ ] 6.3 `/ai/chat` endpoint (server-side call — key ไม่รั่ว) + log ทุก call
- [ ] 6.4 Admin UI: จัดการ ai_providers (priority, enable, model)
- [ ] 6.5 หน้า chat กับ AI coach + session history
- [ ] 6.6 PWA manifest + service worker (offline shell + install)
- [ ] 6.7 SEO: sitemap, meta tags, OG images (บทความ)
- [ ] 6.8 Error monitoring (self-hosted GlitchTip หรือ log-only)
- [ ] 6.9 Load test เบา (k6/vegeta 100 rps 5 นาที)
- [ ] 6.10 Docs สั้น: user guide + admin runbook
- **ส่งมอบ**: เปิดใช้จริง + AI coach ใช้งานได้ทั้ง 3 provider

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
docker compose pull
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose logs -f api web
```

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
- 2026-07-04 11:45 — ยืนยัน 4 decision: ชื่อ **Cheewarun** / domain `cheewarun.duckdns.org` / legacy = keep in git, no deploy / AI = auto-fallback OpenAI→Gemini→Claude. เพิ่ม branding tokens + AI chain design
