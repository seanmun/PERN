# PERN (Pinehurst Experimental Randomizer Network)

Build a mobile-first web application called **PERN**, a persistent, fake-scientific “particle collider” that generates golf matchups between two teams over time via rare collision events.

The app should feel like a serious experimental system, even though it is intentionally absurd.

---

## 🧠 Core Concept

- 12 players → represented as particles
- 6 vs 6 (Team Dan vs Team Ian)
- particles move continuously inside a collider chamber
- rare “collision events” create matchups
- matchups persist and are displayed in the UI
- users can check in anytime to see updates
- optional email notification on collision

IMPORTANT:
- frontend = visual simulation only
- backend = source of truth for collisions
- collisions are NOT based on pixel physics

---

## 🧱 Tech Stack

- React + TypeScript
- Next.js (App Router preferred)
- Tailwind CSS
- Supabase (Auth + Database + Realtime)
- Canvas API for particle animation
- Optional:
  - Resend (email)
  - Framer Motion (UI transitions)

---

## 📱 Design Principles

- mobile-first layout
- consistent “mobile container” even on desktop
- dark, cinematic UI
- clean, readable hierarchy
- no chaotic visuals

Tone:
- fake scientific lab / collider control system
- serious presentation of something ridiculous

---

## 🧍 Players (Seed Data)

### Team Dan (clockwise)
- Dan (Captain)
- Lusty
- Marino
- Kyle
- Musket
- Mallon

### Team Ian (counterclockwise)
- Ian (Captain)
- Andy
- Carty
- Truant
- Munley
- Fran

Rules:
- Team Dan moves clockwise
- Team Ian moves counterclockwise
- matchups must be cross-team
- once matched, players are removed from collider

---

## 🧭 Layout

### Global Structure

Header:
- PERN title (left)
- small login/profile button (right)

Main:
- centered collider chamber (primary focus)

Below:
- start button
- status text

Below:
- matchup list

Below:
- event log (optional collapsible)

---

## 📦 Collider Chamber

The collider is NOT full-screen.

It is a **contained, portrait-style module**:
- max width: ~390–420px
- centered on desktop and mobile
- slightly taller than wide
- rounded corners
- subtle border/glow
- dark glass / reactor aesthetic

Think:
👉 “contained experimental device”

---

## ⚛️ Particle System

Each player = 1 particle

Properties:
- position (x, y)
- angle (for orbital motion)
- direction (1 or -1)
- speed
- team
- active (true/false)

Rendering:
- true core: **1px**
- optional aura: **~20px glow**

IMPORTANT:
- aura is VISUAL ONLY
- must NOT affect collision logic

---

## 🔄 Motion Model

DO NOT use:
- random bouncing
- chaotic motion

USE:
👉 **orbital + slight drift**

Behavior:
- particles orbit around a center
- slight wobble / speed variation
- feels like a magnetic field
- stays readable on mobile

Depth effect:
- front arc = brighter
- back arc = dimmer
- subtle opacity changes

---

## ▶️ Start Behavior

Initial state:
- particles idle or barely visible
- status: "Collider idle"

User taps:
- "Start Collider"

Then:
- particles fade in
- motion eases in
- glow increases
- status updates to "Collider active"

Optional micro-sequence:
- "Initializing field..."
- "Orbital sync achieved"

---

## 💥 Collision System (Backend Controlled)

DO NOT tie collisions to frontend animation.

Instead:
- backend determines collision timing
- collisions are rare (minutes/hours/days apart)
- when triggered:
  - pick 1 active player from each team
  - create matchup
  - mark both inactive
  - persist in DB
  - emit update

---

## 💥 Collision Animation (Frontend)

When collision occurs:

1. particles visually “lock”
2. brightness increases
3. small delay (tension)
4. explosion (burst effect)
5. glowing energy object appears
6. object moves into matchup list
7. transforms into matchup card

On mobile:
- keep animation compact and vertical

---

## 🧾 Matchup List

Show 6 total slots:
- confirmed matchups
- placeholders for remaining

Each card:
- Player A vs Player B
- timestamp
- matchup number

Example:
1. Marino vs Carty — 1:42 PM  
2. Awaiting collision  
3. Awaiting collision  

---

## 📜 Event Log

Simple log of system events:
- collision detected
- chamber stabilized
- system initialized

Mix of:
- real events
- flavor text

---

## 🔐 Auth + Profiles

Use Supabase Auth (magic link)

### Profile Features

Users can:
- log in
- see their team
- see their particle identity
- update:
  - GHIN number
  - handicap index

Users CANNOT edit:
- team
- captain status
- name

---

## 🧍 Profile Data Model

```ts
type Profile = {
  id: string
  userId: string
  name: string
  email: string
  team: "Dan" | "Ian"
  isCaptain: boolean
  ghinNumber: string | null
  handicapIndex: number | null
  ghinLastUpdatedAt: string | null
}