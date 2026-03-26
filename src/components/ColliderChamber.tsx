"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Particle, Player } from "@/types";

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

// Ease-in curve: ramps from 0 to 1 over duration
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface ColliderChamberProps {
  players?: Player[];
}

export default function ColliderChamber({ players }: ColliderChamberProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>(buildParticles());
  const playersInitialized = useRef(false);

  // Update particles when DB players arrive
  useEffect(() => {
    if (players && players.length > 0 && !playersInitialized.current) {
      playersInitialized.current = true;
      particlesRef.current = buildParticles(players);
    } else if (players && players.length > 0) {
      // Update active status from DB without resetting positions
      const playerMap = new Map(players.map((p) => [p.id, p]));
      particlesRef.current.forEach((particle) => {
        const dbPlayer = playerMap.get(particle.id);
        if (dbPlayer) {
          particle.active = dbPlayer.is_active;
        }
      });
    }
  }, [players]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Collider idle");
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const RAMP_DURATION = 3000; // 3s ease-in

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

    // Ramp factor: 0 → 1 over RAMP_DURATION
    const elapsed = Date.now() - startTimeRef.current;
    const ramp = Math.min(1, easeOutCubic(Math.min(elapsed / RAMP_DURATION, 1)));

    // Clear with slight trail
    ctx.fillStyle = "rgba(5, 5, 8, 0.85)";
    ctx.fillRect(0, 0, w, h);

    // Chamber rings
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

    // Update and draw particles
    particlesRef.current.forEach((p) => {
      if (!p.active) return;

      // Update angle (ramped speed)
      p.angle += p.speed * ramp;
      p.radius += p.drift * ramp;

      // Clamp radius
      if (p.radius > 0.8) p.drift = -Math.abs(p.drift);
      if (p.radius < 0.4) p.drift = Math.abs(p.drift);

      const r = baseRadius * p.radius;
      const x = cx + Math.cos(p.angle) * r;
      const y = cy + Math.sin(p.angle) * r;

      // Depth: front arc is brighter
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

      // Core (1px true core)
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

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (!running) return;

    startTimeRef.current = Date.now();
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [running, draw]);

  // Draw idle state
  useEffect(() => {
    if (running) return;
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

    // Dim chamber rings
    for (let i = 0; i < 3; i++) {
      const ringR = baseRadius * (0.3 + i * 0.35);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(99, 102, 241, 0.04)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Dim center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
    ctx.fill();

    // Dim particle positions (barely visible)
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
  }, [running]);

  function handleStart() {
    setRunning(true);
    setStatus("Initializing field...");
    setTimeout(() => setStatus("Calibrating orbital parameters..."), 1200);
    setTimeout(() => setStatus("Orbital sync achieved"), 2400);
    setTimeout(() => setStatus("Collider active — monitoring for collisions"), 3600);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Chamber */}
      <div
        className="relative w-[390px] max-w-[95vw] aspect-[3/4] rounded-2xl border border-border overflow-hidden"
        style={{
          boxShadow: running
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

      {/* Controls */}
      <AnimatePresence mode="wait">
        {!running ? (
          <motion.button
            key="start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleStart}
            className="px-6 py-2 text-sm font-mono tracking-wider border border-indigo-500/30 rounded text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            Start Collider
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
