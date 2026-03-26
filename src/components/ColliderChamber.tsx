"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Particle, Player } from "@/types";

const COLLISION_DISTANCE = 12; // "close enough" but not too easy
const COLLISION_CHANCE = 0.003; // 0.3% chance per frame when close — creates "near misses"
const COLLISION_COOLDOWN = 20_000; // 20 seconds between collisions

const FALLBACK_DAN: Omit<Particle, "angle" | "speed" | "radius" | "drift">[] = [
  { id: "dan", name: "Dan", team: "Dan", is_captain: true, active: true },
  { id: "lusty", name: "Lusty", team: "Dan", is_captain: false, active: true },
  { id: "marino", name: "Marino", team: "Dan", is_captain: false, active: true },
  { id: "kyle", name: "Kyle", team: "Dan", is_captain: false, active: true },
  { id: "musket", name: "Musket", team: "Dan", is_captain: false, active: true },
  { id: "mallon", name: "Mallon", team: "Dan", is_captain: false, active: true },
];

const FALLBACK_IAN: Omit<Particle, "angle" | "speed" | "radius" | "drift">[] = [
  { id: "ian", name: "Ian", team: "Ian", is_captain: true, active: true },
  { id: "andy", name: "Andy", team: "Ian", is_captain: false, active: true },
  { id: "carty", name: "Carty", team: "Ian", is_captain: false, active: true },
  { id: "truant", name: "Truant", team: "Ian", is_captain: false, active: true },
  { id: "munley", name: "Munley", team: "Ian", is_captain: false, active: true },
  { id: "fran", name: "Fran", team: "Ian", is_captain: false, active: true },
];

function buildParticles(dbPlayers?: Player[]): Particle[] {
  const all: Particle[] = [];

  let danList: Omit<Particle, "angle" | "speed" | "radius" | "drift">[];
  let ianList: Omit<Particle, "angle" | "speed" | "radius" | "drift">[];

  if (dbPlayers && dbPlayers.length > 0) {
    danList = dbPlayers
      .filter((p) => p.team === "Dan")
      .map((p) => ({ id: p.id, name: p.name, team: p.team, is_captain: p.is_captain, active: p.is_active }));
    ianList = dbPlayers
      .filter((p) => p.team === "Ian")
      .map((p) => ({ id: p.id, name: p.name, team: p.team, is_captain: p.is_captain, active: p.is_active }));
  } else {
    danList = FALLBACK_DAN;
    ianList = FALLBACK_IAN;
  }

  danList.forEach((p, i) => {
    all.push({
      ...p,
      angle: (Math.PI * 2 * i) / danList.length,
      speed: 0.003 + Math.random() * 0.002,
      radius: 0.6 + Math.random() * 0.15,
      drift: (Math.random() - 0.5) * 0.001,
    });
  });
  ianList.forEach((p, i) => {
    all.push({
      ...p,
      angle: (Math.PI * 2 * i) / ianList.length + Math.PI / 6,
      speed: -(0.003 + Math.random() * 0.002),
      radius: 0.55 + Math.random() * 0.15,
      drift: (Math.random() - 0.5) * 0.001,
    });
  });
  return all;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

type Explosion = {
  x: number;
  y: number;
  nameA: string;
  nameB: string;
  startTime: number;
};

// Map speed (1–10) to collision chance + cooldown
function getCollisionParams(speed: number) {
  const s = Math.max(1, Math.min(10, speed));
  // speed 1: 0.05% chance, 60s cooldown (~45 min total)
  // speed 5: 0.3% chance, 20s cooldown (~12 min total)
  // speed 10: 3% chance, 3s cooldown (~1 min total, testing)
  const chance = 0.0005 * Math.pow(s, 1.8);
  const cooldown = Math.max(3000, 65000 - s * 6500);
  return { chance, cooldown };
}

// Rough estimate of total time for all 6 collisions at a given speed
function estimateTotalTime(speed: number): string {
  const estimates: Record<number, string> = {
    1: "~45 min",
    2: "~30 min",
    3: "~20 min",
    4: "~15 min",
    5: "~10 min",
    6: "~7 min",
    7: "~5 min",
    8: "~3 min",
    9: "~2 min",
    10: "~1 min",
  };
  return estimates[speed] || "~10 min";
}

interface ColliderChamberProps {
  players?: Player[];
  colliderRunning: boolean;
  collisionSpeed?: number;
}

export default function ColliderChamber({ players, colliderRunning, collisionSpeed = 5 }: ColliderChamberProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>(buildParticles());
  const playersInitialized = useRef(false);
  const collisionLock = useRef(false);
  const lastCollisionTime = useRef(0);
  const explosionRef = useRef<Explosion | null>(null);

  // Update particles when DB players arrive
  useEffect(() => {
    if (players && players.length > 0 && !playersInitialized.current) {
      playersInitialized.current = true;
      particlesRef.current = buildParticles(players);
    } else if (players && players.length > 0) {
      const playerMap = new Map(players.map((p) => [p.id, p]));
      particlesRef.current.forEach((particle) => {
        const dbPlayer = playerMap.get(particle.id);
        if (dbPlayer) {
          particle.active = dbPlayer.is_active;
        }
      });
    }
  }, [players]);

  const [status, setStatus] = useState("Collider idle");
  const [starting, setStarting] = useState(false);
  const [collisionText, setCollisionText] = useState<string | null>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const wasRunningRef = useRef(false);

  const RAMP_DURATION = 3000;
  const EXPLOSION_DURATION = 1500;

  // React to shared collider state changes
  useEffect(() => {
    if (colliderRunning && !wasRunningRef.current) {
      wasRunningRef.current = true;
      startTimeRef.current = Date.now();
      setStatus("Initializing field...");
      setTimeout(() => setStatus("Calibrating orbital parameters..."), 1200);
      setTimeout(() => setStatus("Orbital sync achieved"), 2400);
      setTimeout(() => setStatus("Collider active — monitoring for collisions"), 3600);
    } else if (!colliderRunning && wasRunningRef.current) {
      wasRunningRef.current = false;
      setStatus("Collider idle");
    }
  }, [colliderRunning]);

  // Handle collision between two particles
  const handleCollision = useCallback(async (pA: Particle, pB: Particle, x: number, y: number) => {
    if (collisionLock.current) return;
    collisionLock.current = true;

    // Immediately mark inactive locally so they stop rendering
    pA.active = false;
    pB.active = false;

    // Show explosion
    explosionRef.current = {
      x,
      y,
      nameA: pA.name,
      nameB: pB.name,
      startTime: Date.now(),
    };

    setCollisionText(`${pA.name} ↔ ${pB.name}`);
    setTimeout(() => setCollisionText(null), 3000);

    // Report to backend
    try {
      await fetch("/api/collide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerAId: pA.id, playerBId: pB.id }),
      });
    } catch {
      // Backend will handle — particles already visually removed
    }

    // Unlock after explosion finishes
    setTimeout(() => {
      collisionLock.current = false;
      explosionRef.current = null;
    }, EXPLOSION_DURATION);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = Math.min(w, h) * 0.38;

    const elapsed = Date.now() - startTimeRef.current;
    const ramp = Math.min(1, easeOutCubic(Math.min(elapsed / RAMP_DURATION, 1)));

    ctx.fillStyle = "rgba(5, 5, 8, 0.85)";
    ctx.fillRect(0, 0, w, h);

    // Draw orbit rings
    for (let i = 0; i < 3; i++) {
      const ringR = baseRadius * (0.3 + i * 0.35);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(99, 102, 241, ${0.03 + i * 0.02})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(99, 102, 241, ${0.15 * ramp})`;
    ctx.fill();

    // Compute particle positions and draw them
    const positions: { p: Particle; x: number; y: number }[] = [];

    particlesRef.current.forEach((p) => {
      if (!p.active) return;

      p.angle += p.speed * ramp;
      p.radius += p.drift * ramp;

      if (p.radius > 0.8) p.drift = -Math.abs(p.drift);
      if (p.radius < 0.4) p.drift = Math.abs(p.drift);

      const r = baseRadius * p.radius;
      const x = cx + Math.cos(p.angle) * r;
      const y = cy + Math.sin(p.angle) * r;

      positions.push({ p, x, y });

      const depth = (Math.sin(p.angle) + 1) / 2;
      const alpha = (0.3 + depth * 0.7) * ramp;

      const isDan = p.team === "Dan";
      const rgb = isDan ? "59, 130, 246" : "239, 68, 68";

      // Outer glow
      const glowSize = 20 * ramp;
      const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
      outerGlow.addColorStop(0, `rgba(${rgb}, ${alpha * 0.3})`);
      outerGlow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(x, y, glowSize, 0, Math.PI * 2);
      ctx.fillStyle = outerGlow;
      ctx.fill();

      // Inner glow
      const innerGlow = ctx.createRadialGradient(x, y, 0, x, y, 6 * ramp);
      innerGlow.addColorStop(0, `rgba(${rgb}, ${alpha * 0.8})`);
      innerGlow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(x, y, 6 * ramp, 0, Math.PI * 2);
      ctx.fillStyle = innerGlow;
      ctx.fill();

      // Core pixel
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fillStyle = isDan
        ? `rgba(147, 197, 253, ${alpha})`
        : `rgba(252, 165, 165, ${alpha})`;
      ctx.fill();

      // Name label
      if (ramp > 0.5) {
        const labelAlpha = Math.min(1, (ramp - 0.5) * 2) * alpha;
        ctx.font = "9px monospace";
        ctx.fillStyle = `rgba(228, 228, 231, ${labelAlpha * 0.7})`;
        ctx.textAlign = "center";
        ctx.fillText(p.name, x, y - 14);
      }
    });

    // Collision detection — check all cross-team pairs
    const { chance, cooldown } = getCollisionParams(collisionSpeed);
    const now = Date.now();
    const cooldownMet = now - lastCollisionTime.current > cooldown;

    if (ramp >= 1 && !collisionLock.current && cooldownMet) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          if (a.p.team === b.p.team) continue; // same team, skip

          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Close enough AND random chance fires — creates "near misses"
          if (dist < COLLISION_DISTANCE && Math.random() < chance) {
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            lastCollisionTime.current = now;
            handleCollision(a.p, b.p, midX, midY);
            break;
          }
        }
        if (collisionLock.current) break;
      }
    }

    // Draw explosion effect
    const explosion = explosionRef.current;
    if (explosion) {
      const t = (Date.now() - explosion.startTime) / EXPLOSION_DURATION;
      if (t < 1) {
        const expandRadius = 60 * t;
        const fadeAlpha = 1 - t;

        // White flash
        const flash = ctx.createRadialGradient(
          explosion.x, explosion.y, 0,
          explosion.x, explosion.y, expandRadius
        );
        flash.addColorStop(0, `rgba(255, 255, 255, ${fadeAlpha * 0.9})`);
        flash.addColorStop(0.3, `rgba(200, 180, 255, ${fadeAlpha * 0.5})`);
        flash.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, expandRadius, 0, Math.PI * 2);
        ctx.fillStyle = flash;
        ctx.fill();

        // Sparks
        const sparkCount = 12;
        for (let s = 0; s < sparkCount; s++) {
          const sparkAngle = (Math.PI * 2 * s) / sparkCount + t * 2;
          const sparkDist = expandRadius * (0.5 + Math.random() * 0.5);
          const sx = explosion.x + Math.cos(sparkAngle) * sparkDist;
          const sy = explosion.y + Math.sin(sparkAngle) * sparkDist;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5 * fadeAlpha, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha * 0.8})`;
          ctx.fill();
        }

        // Collision label
        if (t < 0.7) {
          ctx.font = "bold 11px monospace";
          ctx.fillStyle = `rgba(255, 255, 255, ${fadeAlpha})`;
          ctx.textAlign = "center";
          ctx.fillText("COLLISION", explosion.x, explosion.y - 30);
          ctx.font = "9px monospace";
          ctx.fillText(
            `${explosion.nameA} ↔ ${explosion.nameB}`,
            explosion.x,
            explosion.y - 18
          );
        }
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, [handleCollision]);

  useEffect(() => {
    if (!colliderRunning) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [colliderRunning, draw]);

  // Draw idle state
  useEffect(() => {
    if (colliderRunning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = Math.min(w, h) * 0.38;

    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 3; i++) {
      const ringR = baseRadius * (0.3 + i * 0.35);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(99, 102, 241, 0.04)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
    ctx.fill();

    particlesRef.current.forEach((p) => {
      if (!p.active) return;
      const r = baseRadius * p.radius;
      const x = cx + Math.cos(p.angle) * r;
      const y = cy + Math.sin(p.angle) * r;
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fillStyle =
        p.team === "Dan"
          ? "rgba(59, 130, 246, 0.15)"
          : "rgba(239, 68, 68, 0.15)";
      ctx.fill();
    });
  }, [colliderRunning]);

  async function handleStart() {
    setStarting(true);
    await fetch("/api/collider", { method: "POST" });
    setStarting(false);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Label */}
      <p className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase">
        Small Hadron Collider
      </p>

      {/* Chamber */}
      <div
        className="relative w-[390px] max-w-[95vw] aspect-[3/4] rounded-2xl border border-border overflow-hidden"
        style={{
          boxShadow: colliderRunning
            ? "0 0 60px rgba(99, 102, 241, 0.08), inset 0 0 80px rgba(0,0,0,0.6)"
            : "0 0 30px rgba(99, 102, 241, 0.03), inset 0 0 60px rgba(0,0,0,0.5)",
        }}
      >
        <canvas
          ref={canvasRef}
          width={390}
          height={520}
          className="w-full h-full"
        />
      </div>

      {/* Collision flash text */}
      <AnimatePresence>
        {collisionText && (
          <motion.p
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm font-mono text-white tracking-wider"
          >
            {collisionText}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Controls */}
      <AnimatePresence mode="wait">
        {!colliderRunning ? (
          <motion.button
            key="start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleStart}
            disabled={starting}
            className="px-6 py-2 text-sm font-mono tracking-wider border border-indigo-500/30 rounded text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
          >
            {starting ? "Starting..." : "Start Collider"}
          </motion.button>
        ) : (
          <motion.p
            key="status"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-mono text-zinc-500 tracking-wider"
          >
            {status}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
