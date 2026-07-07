# MetaBreath — UI Redesign Plan (Xiaomi Mi Fitness inspired)

> เอกสารนี้เป็นแผนการปรับ UI ของ MetaBreath ให้มีความ premium / minimal / dark-first
> อ้างอิงจาก reference: Xiaomi Mi Fitness (IMG_0714 – IMG_0719)
> Owner: Bright Studio × PLAaiD · Date: 2026-07-07

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Design Principles](#2-design-principles)
3. [Design Tokens](#3-design-tokens)
4. [Information Architecture](#4-information-architecture)
5. [User App — Page by Page](#5-user-app--page-by-page)
6. [Admin App — Page by Page](#6-admin-app--page-by-page)
7. [Tech Stack](#7-tech-stack)
8. [Component Library](#8-component-library)
9. [Implementation Phases](#9-implementation-phases)
10. [Accessibility & i18n](#10-accessibility--i18n)
11. [Open Questions](#11-open-questions)

---

## 1. Vision & Goals

**Vision:**
> MetaBreath คือ *breath acetone monitoring app* ที่ต้องดู premium ระดับเดียวกับ Apple Health / Xiaomi Mi Fitness
> เพื่อให้ผู้ใช้เชื่อมั่นในผลตรวจและใช้งานทุกวันได้อย่างเป็นธรรมชาติ

**Goals หลัก 5 ข้อ:**
1. **Dark-first premium look** — ตอบโจทย์ผู้ใช้ที่ตรวจตอนเช้ามืด/กลางคืน + ประหยัดแบต OLED
2. **Self-service device pairing** — ผู้ใช้จับคู่ ESP32 ได้เองผ่าน BLE / QR / manual (ไม่ต้องพึ่งแอดมิน)
3. **Theming system** — ผู้ใช้เลือก mode (System/Light/Dark) และ accent color ได้
4. **Unified UX ระหว่าง user & admin** — Admin ใช้ design language เดียวกัน แต่มี dashboard KPI + management tools
5. **Motion-conscious** — subtle animations, respects `prefers-reduced-motion`

**Non-goals:**
- ไม่ทำ social feed / friend leaderboard ใน phase นี้
- ไม่ทำ native app — คง PWA
- ไม่ทำ multi-language beyond Thai/English (ที่มีอยู่แล้ว)

---

## 2. Design Principles

### 2.1 Depth via layering ไม่ใช่ shadow
Dark theme → shadow ไม่ชัด ให้ใช้ **background elevation** แทน:
```
bg-primary (#0A0A0A) → bg-surface (#141414) → bg-elevated (#1F1F1F) → bg-raised (#2A2A2A)
```

### 2.2 One accent, many neutrals
- **Accent:** Mint (`#00C896`) — เอกลักษณ์ MetaBreath คงไว้
- **Everything else:** grayscale หรือ tinted-neutral
- Colored circles ใช้เฉพาะ **category icons** (heart=red, sleep=purple, breath=mint)

### 2.3 Content-first cards
- Radius ใหญ่ (16–24px)
- Padding แน่น (16–20px)
- ไม่มี border บน dark theme (ใช้ bg elevation แทน)
- Border บาง (1px) เฉพาะ input / interactive elements

### 2.4 Typography ranking ชัดเจน
- Numeric hero: `text-4xl font-bold tracking-tight` (measurements)
- Section title: `text-xs font-semibold uppercase tracking-widest text-muted`
- Body: `text-sm text-base`
- Caption: `text-xs text-muted`

### 2.5 Progressive disclosure
- Card หน้าแรกโชว์ metric สำคัญ 1 ตัว
- Tap → drawer/detail แสดง trend + history + reference

---

## 3. Design Tokens

### 3.1 Color palette (CSS variables ใน globals.css)

```css
@theme {
  /* ─── Backgrounds (Dark) ──────────────────────────── */
  --color-bg-primary:  #0A0A0A;
  --color-bg-surface:  #141414;
  --color-bg-elevated: #1F1F1F;
  --color-bg-raised:   #2A2A2A;
  --color-bg-overlay:  #00000099;

  /* ─── Text ────────────────────────────────────────── */
  --color-text-primary:   #FAFAFA;
  --color-text-secondary: #B8B8B8;
  --color-text-muted:     #7A7A7A;
  --color-text-disabled:  #4A4A4A;

  /* ─── Divider / Border (subtle on dark) ──────────── */
  --color-border-soft:   #262626;
  --color-border-strong: #383838;

  /* ─── Brand (already exists — keep) ──────────────── */
  --color-mint-500: #00C896;  /* accent */
  --color-mint-400: #22D6B2;
  --color-mint-600: #009B74;

  /* ─── Category icons ─────────────────────────────── */
  --color-cat-breath:  #00C896;  /* mint */
  --color-cat-heart:   #FF3B4A;  /* red */
  --color-cat-sleep:   #A855F7;  /* purple */
  --color-cat-oxygen:  #3B82F6;  /* blue */
  --color-cat-stress:  #F59E0B;  /* amber */
  --color-cat-workout: #10B981;  /* emerald */

  /* ─── Semantic ────────────────────────────────────── */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger:  #EF4444;
  --color-info:    #3B82F6;
}

/* Light mode override */
[data-theme="light"] {
  --color-bg-primary:  #FAFAF7;
  --color-bg-surface:  #FFFFFF;
  --color-bg-elevated: #F4F4F1;
  --color-bg-raised:   #EEEDE8;
  --color-text-primary:   #0A0A0A;
  --color-text-secondary: #4A4A4A;
  --color-text-muted:     #7A7A7A;
  --color-border-soft:    #EEEDE8;
  --color-border-strong:  #DADADA;
}
```

### 3.2 Spacing & sizing

- Base 4px grid (Tailwind default)
- Card radius: `rounded-2xl` (16px) / `rounded-3xl` (24px)
- Icon container: `w-10 h-10 rounded-xl` (colored circle)
- Segmented pill nav: `h-9 px-4 rounded-full`

### 3.3 Typography

- Font: **Inter** (English) + **Sarabun** (Thai) — มีอยู่แล้ว
- Display: Playfair Display (สำหรับ landing / branding เท่านั้น)

### 3.4 Motion

```css
--motion-fast:   150ms;
--motion-base:   250ms;
--motion-slow:   400ms;
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
```
- ทุก transition ต้อง respect `@media (prefers-reduced-motion: reduce)`

---

## 4. Information Architecture

### 4.1 Top-level (user)

```
┌─────────────────────────────────────────────┐
│  [Health · Breathing · Device · Profile]  ⊕│
└─────────────────────────────────────────────┘
```
- แทน bottom nav เดิม → top pill segmented (mobile + desktop เหมือนกัน)
- `⊕` มุมขวาบน → dropdown: **Scan QR** / **Add device** / **Log reading**

**Route map:**
| Tab       | Path         | Existing? |
|-----------|-------------|-----------|
| Health    | `/home`     | ✅ (redesign) |
| Breathing | `/breathing` | ❌ (new) |
| Device    | `/me/device` | ✅ (redesign) |
| Profile   | `/me`        | ✅ (redesign) |

Retired: `/chat` (ย้ายเป็น floating action button), `/trends` (ย้ายเข้า Health tab), `/log` (แทนที่ด้วย ⊕ menu)

### 4.2 Admin nav

```
┌────────────────────────────────────────────────────────┐
│  [Overview · Users · Devices · Readings · Content]  ⊕ │
└────────────────────────────────────────────────────────┘
```

---

## 5. User App — Page by Page

### 5.1 Health tab — `/home`

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  02:11 Tue 7 Jul                4G 77%
  [Health · Breathing · Device · Profile] ⊕

     ╭────────────────────────╮
     │    ✦ Acetone Ring     │
     │    ╭─────────╮         │
     │    │  42 ppm │  ← center = current
     │    │moderate │
     │    ╰─────────╯
     │  Ketosis · today       │
     ╰────────────────────────╯

  🍪 Streak x7            [View all]

  ┌────────┬────────┬────────┐
  │🔥 Cal  │👣 Steps│⏱ Move │
  │  420   │ 5,200  │  45m  │
  │ /2000  │ /8000  │  /60m │
  └────────┴────────┴────────┘

  ┌───────────────┬───────────────┐
  │🌬 Breath      │📈 Trend       │
  │moderate 42ppm │↗ +2.1 ppm/day│
  │Tap for detail │7-day forecast │
  └───────────────┴───────────────┘

  ┌───────────────┬───────────────┐
  │💤 Sleep       │❤️ Heart Rate  │
  │Coming soon    │Coming soon    │
  └───────────────┴───────────────┘

  📝 Log
  Today's readings · 3 sessions
  ▸ 08:15  moderate  42 ppm
  ▸ 12:30  low       28 ppm
  ▸ 20:00  moderate  38 ppm
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Components ใหม่:**
- `<AcetoneRing />` — SVG animated ring, gradient stroke, center number
- `<StreakBadge />` — cookie icon + xN with subtle glow
- `<MetricCard />` — icon + label + value / goal + mini progress bar
- `<CategoryCard />` — grid item, icon circle, title, value, tap-to-expand

### 5.2 Breathing tab — `/breathing` (new)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Health · Breathing · Device · Profile]

  ╭────────────────────────────╮
  │  MetaBreath TGS1820 v1     │
  │  ● Connected · 87% battery │
  ╰────────────────────────────╯

           ╭──────────╮
           │    🌬    │      ← large tap-to-start
           │  START   │
           │ SESSION  │
           ╰──────────╯

  Recent sessions
  ┌────────────────────────────┐
  │ Today 08:15                │
  │ 42 ppm · moderate · 8.2s   │
  │ Quality 92 · Reliability 88│
  └────────────────────────────┘
  ┌────────────────────────────┐
  │ Yesterday 20:00            │
  │ 38 ppm · moderate · 7.9s   │
  └────────────────────────────┘
  [View all sessions →]

  Quick actions
  ┌────────┬─────────┬─────────┐
  │Calibrate│ Report │ Trend  │
  └────────┴─────────┴─────────┘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5.3 Device tab — `/me/device` (redesign)

Match closely to IMG_0716:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Health · Breathing · Device · Profile] ⊕

  ┌─────────────────────────────────┐
  │  [📷 device photo]              │
  │      MetaBreath TGS1820 v1 ▼   │
  │      Device disconnected        │
  │       [ ● Connect ]             │
  └─────────────────────────────────┘

  ⚠️ Allow BLE access
  Multiple features require Bluetooth
  permission [Allow]

  Sensor modes                   [All ›]
  ┌─────┬─────┬─────┬─────┬─────┐
  │🔬 Cal│⚡Fast│🎯Prec│🌙Sleep│🏃Ex  │
  │brate │scan │ision │mode  │ercise│
  └─────┴─────┴─────┴─────┴─────┘

  Menu
  ├── 🔔 Notifications & alerts       ›
  ├── 📊 Sensor data & history         ›
  ├── 🧪 Calibration & reports         ›
  ├── ⚙️ Sensor settings              ›
  ├── 🔒 Data privacy                  ›
  └── ⚙️ Advanced settings             ›
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Sub-routes:**
- `/me/device/[id]/calibrate` (existing) — keep, restyle for dark
- `/me/device/[id]/report` (existing) — keep, restyle
- `/me/device/[id]/settings` (new) — sensor threshold, calibration schedule
- `/me/device/[id]/data` (new) — raw MQTT stream / CSV export
- `/me/device/add` (new) — add device flow (below)

### 5.4 Add device flow — `/me/device/add` (new)

Match IMG_0719:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ← Add device

  ┌─────────────────────────────────────┐
  │  🔄 Searching for devices…         │
  └─────────────────────────────────────┘

  ╰─── (BLE scan runs in background) ──╯

  ┌─────────────────────────────────────┐
  │ ● MetaBreath-A7B2  · signal ▮▮▮▮   │
  │   Tap to pair                       │
  └─────────────────────────────────────┘




                                          
  ┌───────────────┬───────────────┐
  │  📷 Scan code │   ➕ Add model │
  └───────────────┴───────────────┘

     Having trouble? [View help ›]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**3 pairing methods:**
1. **BLE auto-scan** → wraps existing `/me/device/pair` GATT logic
2. **Scan QR** → camera opens (using `@zxing/browser`) → decodes device_id + secret → auto-pair MQTT
3. **Add model manually** → dropdown of supported models (TGS1820 v1, TGS2600, etc.) → generates MQTT credentials

### 5.5 Profile tab — `/me` (redesign)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Health · Breathing · Device · Profile] ⊕

  ┌──────────────────────────────────┐
  │ 👤  Pranai Phoprasat            │
  │     Male · 172cm · 24y          │
  │     Goal: Keto · Level 3        │
  │     [Edit profile ›]             │
  └──────────────────────────────────┘

  🏆 Competition — Coming soon        [View]

  Menu
  ├── ⚙️ App settings                 ›
  ├── 🎨 Theme & appearance          ›  ← NEW
  ├── 🌐 Language                     ›
  ├── 🔗 Third-party data (Google Fit)›
  ├── 🔐 Permissions                  ›
  ├── 💬 Feedback                     ›
  ├── ℹ️ About                        ›
  └── 🚪 Log out                     ›
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5.6 Theme & appearance — `/me/settings/appearance` (new)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ← Theme & appearance

  Mode
  ┌────────┬─────────┬────────┐
  │ System │  Light  │  Dark  │
  │   ○    │    ○    │   ●    │
  └────────┴─────────┴────────┘

  Accent color
  ┌───┬───┬───┬───┬───┬───┐
  │🟢│🟠│🟣│🔵│🌸│🟡│    ← Mint/Peach/Purple/Blue/Pink/Yellow
  │ ● │   │   │   │   │   │
  └───┴───┴───┴───┴───┴───┘

  Card style
  ┌────────┬──────────┬──────────┐
  │ Solid  │ Glass    │ Gradient │
  │   ●    │    ○     │    ○     │
  └────────┴──────────┴──────────┘

  Motion
  [Reduce motion (auto-detect)] ▼

  Preview
  ╭────────────────────────╮
  │ [Live preview of home] │
  ╰────────────────────────╯
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- Settings persist ทั้ง `localStorage` และ sync ไป backend (`PATCH /profile`)
- Live preview อัพเดตทันทีขณะเลือก

### 5.7 AI Chat — FAB (Floating Action Button)

- แทนที่การเปิดหน้า `/chat` เต็มจอ → ใช้ FAB มุมขวาล่าง
- Tap → sheet/drawer พร้อม chat interface
- ใช้ Claude Sonnet (ตามที่ตั้งใน CLAUDE_MODEL)

---

## 6. Admin App — Page by Page

### 6.1 Overview — `/admin`

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Overview · Users · Devices · Readings · Content] ⊕

  ┌──────────┬──────────┬──────────┬──────────┐
  │  Users   │ Active   │Readings  │ Devices  │
  │  1,247   │  DAU 314 │ /day 8.2k│  Active89│
  │  +12 ↗   │  +5%  ↗  │  +18% ↗  │  +2%  ↗  │
  └──────────┴──────────┴──────────┴──────────┘

  Readings by hour (24h)
  ▁▁▂▂▃▅▇█▇▆▄▃▂▂▂▂▂▃▄▅▆▄▃▂

  Recent activity
  ├── 10:32  P0043 paired MetaBreath-9F1E
  ├── 10:15  P0087 uploaded reading (moderate)
  └── 09:58  P0021 calibrated device

  Alerts
  🔴 3 devices need recalibration
  🟡 1 pilot session missing data
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.2 Users — `/admin/users`

- Existing table + drawer, restyle for dark
- Row click → drawer with: profile, devices, reading summary, actions
- Actions: force onboard, reset password (send email), assign device manually

### 6.3 Devices — `/admin/devices`

- Table of all devices across users
- Filter: needs recalibration / offline / active
- Bulk actions: send calibration reminder push

### 6.4 Readings — `/admin/readings`

- Existing manual reading entry (keep)
- Add: Timescale query builder + CSV export
- Chart of readings by device / by user

### 6.5 Content — `/admin/content`

- Articles CRUD
- Quests CRUD
- Badges CRUD

---

## 7. Tech Stack

### 7.1 Current (keep)

| Package | Version | Purpose |
|---------|---------|---------|
| next | 16.2.10 | App Router, standalone build |
| react | 19.2.4 | UI |
| tailwindcss | v4 (PostCSS plugin) | Styling |
| @tanstack/react-query | 5.101 | Data fetching |
| react-hook-form + zod | 7.80 / 4.4 | Forms |
| lucide-react | 1.23 | Icons |
| recharts | 3.9 | Trend charts |
| class-variance-authority | 0.7 | Component variants |
| tailwind-merge | 3.6 | Merging tw classes |
| clsx | 2.1 | Conditional classes |
| @types/web-bluetooth | 0.0.21 | BLE typings |

### 7.2 To add

| Package | Version | Purpose |
|---------|---------|---------|
| **next-themes** | ^0.4.4 | Theme mode switcher (System/Light/Dark) with SSR-safe hydration |
| **framer-motion** | ^11.15 | Page transitions + micro-interactions (respects reduced-motion) |
| **@zxing/browser** | ^0.1.5 | QR code scanning for device pairing |
| **@radix-ui/react-dialog** | ^1.1 | Accessible drawer/modal (settings, add device) |
| **@radix-ui/react-dropdown-menu** | ^2.1 | ⊕ menu (Scan / Add device / Log) |
| **@radix-ui/react-tabs** | ^1.1 | Pill segmented nav (accessible, keyboard-nav) |
| **@radix-ui/react-toast** | ^1.2 | Success/error toasts |
| **sonner** | ^1.7 | Alternative simpler toast (choose 1) |
| **vaul** | ^1.1 | Mobile bottom sheet (native-feel drawer) |
| **jotai** | ^2.10 | Lightweight state (theme, accent, current tab) — alternative to Zustand |

**Decision points:**
- Toast: **Sonner** (simpler API) OR Radix Toast (more control)  → recommend Sonner
- State: **Jotai** OR keep React context (`useAuth`, `useT` already exist)  → recommend Jotai only if state grows

### 7.3 Backend additions (optional)

- `PATCH /profile` already supports `goal_type`, `display_name` — extend to accept `theme_mode`, `accent_color`, `card_style`
- Or store on client only (localStorage) — recommend **client-only** for phase 1

---

## 8. Component Library

### 8.1 Layout & navigation

```
components/
├── nav/
│   ├── PillNav.tsx           ← top pill segmented (Health/Breathing/Device/Profile)
│   ├── PlusMenu.tsx          ← ⊕ dropdown (Scan/Add device/Log)
│   └── FloatingAIButton.tsx  ← FAB for AI chat
├── layout/
│   ├── AppShell.tsx          ← wraps PillNav + main + FAB
│   └── PageHeader.tsx        ← title + back button + trailing actions
```

### 8.2 Cards & data display

```
├── cards/
│   ├── AcetoneRing.tsx       ← animated SVG ring (main hero)
│   ├── StreakBadge.tsx       ← cookie + count
│   ├── MetricCard.tsx        ← icon + label + value/goal + progress
│   ├── CategoryCard.tsx      ← grid item (Breath/Trend/Sleep/etc)
│   ├── DeviceCard.tsx        ← device with status + battery
│   └── ReadingRow.tsx        ← compact row for history list
```

### 8.3 UI primitives (wrap Radix)

```
├── ui/
│   ├── Button.tsx            ← variants: primary/secondary/ghost/danger
│   ├── Tabs.tsx              ← Radix Tabs styled as pills
│   ├── Dropdown.tsx          ← Radix Dropdown
│   ├── Sheet.tsx             ← Vaul bottom sheet
│   ├── Dialog.tsx            ← Radix Dialog for desktop modal
│   ├── Toast.tsx             ← Sonner wrapper
│   ├── Switch.tsx            ← toggle
│   ├── Segment.tsx           ← segmented radio (Mode picker)
│   └── ColorSwatch.tsx       ← accent picker
```

### 8.4 Theme

```
├── theme/
│   ├── ThemeProvider.tsx     ← wraps next-themes + accent context
│   ├── ThemePreview.tsx      ← live mini home for settings page
│   └── tokens.ts             ← TS exports of CSS var names
```

---

## 9. Implementation Phases

### Phase 0 — Foundations (2h)
- [ ] Install new packages (next-themes, framer-motion, @zxing/browser, radix, vaul, sonner)
- [ ] Add dark palette tokens to `globals.css`
- [ ] Setup `ThemeProvider` (next-themes) + accent context
- [ ] `data-theme="dark"` on `<html>` + `class="dark"` for Tailwind dark variants

### Phase 1 — Nav Refactor (3h)
- [ ] Build `<PillNav />` with Radix Tabs
- [ ] Build `<PlusMenu />` with Radix Dropdown
- [ ] Add `<FloatingAIButton />` (Vaul sheet)
- [ ] Update `app/(app)/layout.tsx` — remove sidebar/bottom-nav
- [ ] Route mapping: `/breathing` new route

### Phase 2 — Health Dashboard (5h)
- [ ] `<AcetoneRing />` — SVG animated
- [ ] `<StreakBadge />`
- [ ] `<MetricCard />` (Cal / Steps / Moving from ActivityLog + kcal aggregation)
- [ ] `<CategoryCard />` grid (Breath / Trend / Sleep / Heart)
- [ ] Wire to existing `/logs/*` + `/sensor/readings` APIs
- [ ] Empty states for "Coming soon" (Sleep / Heart)

### Phase 3 — Breathing tab (4h)
- [ ] New route `/breathing`
- [ ] Device status header (BLE or MQTT)
- [ ] "Start session" central CTA → BLE session or manual entry
- [ ] Recent sessions list
- [ ] Quick actions row

### Phase 4 — Device tab redesign (3h)
- [ ] Redesign `/me/device` list with hero card
- [ ] Add "Sensor modes" horizontal scroll
- [ ] Menu list matching Xiaomi style
- [ ] Restyle `/me/device/[id]/calibrate` and `/report` for dark

### Phase 5 — Add device flow (4h)
- [ ] `/me/device/add` — auto BLE scan (existing GATT logic)
- [ ] QR scan via `@zxing/browser` — decode payload `metabreath://pair?id=UUID&secret=XX`
- [ ] Manual model picker + confirm
- [ ] Success screen with MQTT credentials + firmware snippet

### Phase 6 — Profile + Settings (3h)
- [ ] Profile card + menu
- [ ] `/me/settings` index
- [ ] `/me/settings/appearance` — mode / accent / card style / motion
- [ ] Live preview mini-Home embed
- [ ] Persist to localStorage + optional backend

### Phase 7 — Admin redesign (4h)
- [ ] Pill nav for admin
- [ ] Overview dashboard KPIs + activity feed
- [ ] Restyle users / devices / readings tables for dark
- [ ] Add device management bulk actions

### Phase 8 — Polish & QA (3h)
- [ ] Framer Motion page transitions
- [ ] Empty states + loading skeletons everywhere
- [ ] Test on iOS Safari (BLE fallback → QR/manual only)
- [ ] Test light mode toggle end-to-end
- [ ] a11y audit (contrast, focus rings, aria-labels)

**Total: ~31h**

---

## 10. Accessibility & i18n

### 10.1 A11y checklist

- Contrast ≥ 4.5:1 on text (WCAG AA) — audit both Dark and Light modes
- Focus rings visible (`focus-visible:ring-2 ring-mint-400 ring-offset-2 ring-offset-bg-primary`)
- Keyboard navigation on Pill Tabs (Radix handles this)
- Screen reader labels on icon-only buttons
- `prefers-reduced-motion` respected in all `framer-motion` animations
- Tap targets ≥ 44×44 px on mobile

### 10.2 i18n

- ระบบ `useT()` มีอยู่แล้ว (Thai/English)
- ต้องเพิ่ม keys ใหม่: `settings.theme.*`, `device.add.*`, `breathing.*`
- ตรวจสอบว่า Thai fits ในทุก card (มักยาวกว่า English)

---

## 11. Open Questions

1. **Sleep / Heart Rate / Blood Oxygen cards** — โชว์ "Coming soon" หรือลบทิ้ง?
   - Recommend: โชว์ตัว placeholder เพื่อ layout สมมาตร + ให้ user รู้ว่ากำลังพัฒนา

2. **Accent color persist location** — localStorage only หรือ sync backend?
   - Recommend: localStorage phase 1 → backend เมื่อทำ multi-device sync

3. **QR pairing payload format** — decide schema เช่น:
   - `metabreath://pair?id=<uuid>&secret=<base64>&broker=<host:port>`

4. **Camera permission handling** — iOS Safari requires HTTPS (ตอนนี้ live แล้ว ✅)

5. **Admin theme parity** — admin ใช้ dark เหมือน user หรือ light เพื่อความอ่านง่ายของ data?
   - Recommend: default dark + toggle to light (same system)

6. **Xiaomi's "Steps" / "Calories" / "Moving"** — จะ compute จาก `ActivityLog` (existing) หรือ integrate Google Fit / Apple Health?
   - Phase 1: ใช้ ActivityLog ที่มี
   - Phase 2+: Google Fit sync

---

## 12. Success Metrics

- **Perceived quality** — user survey score ≥ 4/5 for "app feels premium"
- **Self-service pair rate** — ≥ 80% of new users pair device without admin help
- **Theme adoption** — ≥ 40% users change default (indicates the feature is discoverable & valuable)
- **Session length** — +30% vs. baseline (indicates engagement improvement)
- **7-day retention** — +15% vs. baseline

---

## Appendix A — Reference imagery

Screenshots ที่เป็นแรงบันดาลใจ (จาก user):
- IMG_0714 — Health tab (rings + metrics + grid)
- IMG_0715 — Workout tab (quick actions + history + training indices)
- IMG_0716 — Device tab (device card + modes + menu)
- IMG_0717 — Profile tab (user info + menu)
- IMG_0718 — ⊕ menu (Scan / Add device)
- IMG_0719 — Add device screen (searching + Scan code + Add model)

Referenced from Xiaomi Mi Fitness. เราไม่ copy 1:1 แต่ยืม language:
- Pill segmented nav
- Dark bg + colored circle icons
- Grid card layout
- ⊕ menu pattern
- "Searching…" scan screen
