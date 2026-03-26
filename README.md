# PERN

**Pinehurst Experimental Randomizer Network**

A particle collider that generates golf matchups.

## What is this?

PERN is a fake-scientific "Small Hadron Collider" built for Pinehurst golf trips. Twelve players — six from Team Dan, six from Team Ian — are represented as glowing particles orbiting inside a dark chamber. When two particles from opposing teams drift close enough together, they collide, explode, and create a matchup.

The collisions are completely random. No one picks the matchups. You start the collider, watch the particles orbit, and wait for fate to decide who plays who.

## How it works

- 12 particles orbit continuously — Team Dan clockwise (blue), Team Ian counterclockwise (red)
- Each particle has its own speed, orbital radius, and drift
- When a blue particle and a red particle get close enough, there's a chance they collide
- A collision triggers an explosion animation, locks in the matchup, and removes both particles from the chamber
- Everyone watches the same collider instance in real time across all devices
- Six collisions = six matchups = full card

## The collider

The collision frequency is configurable from the admin panel — from ~45 minutes (suspenseful) down to ~1 minute (testing mode). Particles can graze past each other without colliding, creating near-misses that build tension.

## Teams

**Team Dan** — Dan (C), Lusty, Marino, Kyle, Musket, Mallon

**Team Ian** — Ian (C), Andy, Carty, Truant, Munley, Fran

## Built with

Next.js, TypeScript, Tailwind CSS, Supabase, Canvas API, Framer Motion
