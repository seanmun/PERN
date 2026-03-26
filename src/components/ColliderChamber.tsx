"use client";

import { useRef, useEffect, useState } from "react";
import type { Particle } from "@/types";

const TEAM_DAN: Omit<Particle, "angle" | "speed" | "radius" | "drift">[] = [
  { id: "dan", name: "Dan", team: "Dan", is_captain: true, active: true },
  { id: "lusty", name: "Lusty", team: "Dan", is_captain: false, active: true },
  { id: "marino", name: "Marino", team: "Dan", is_captain: false, active: true },
  { id: "kyle", name: "Kyle", team: "Dan", is_captain: false, active: true },
  { id: "musket", name: "Musket", team: "Dan", is_captain: false, active: true },
  { id: "mallon", name: "Mallon", team: "Dan", is_captain: false, active: true },
];

const TEAM_IAN: Omit<Particle, "angle" | "speed" | "radius" | "drift">[] = [
  { id: "ian", name: "Ian", team: "Ian", is_captain: true, active: true },
  { id: "andy", name: "Andy", team: "Ian", is_captain: false, active: true },
  { id: "carty", name: "Carty", team: "Ian", is_captain: false, active: true },
  { id: "truant", name: "Truant", team: "Ian", is_captain: false, active: true },
  { id: "munley", name: "Munley", team: "Ian", is_captain: false, active: true },
  { id: "fran", name: "Fran", team: "Ian", is_captain: false, active: true },
];

function initParticles(): Particle[] {
  const all: Particle[] = [];
  TEAM_DAN.forEach((p, i) => {
    all.push({
      ...p,
      angle: (Math.PI * 2 * i) / TEAM_DAN.length,
      speed: 0.003 + Math.random() * 0.002,
      radius: 0.6 + Math.random() * 0.15,
      drift: (Math.random() - 0.5) * 0.001,
    });
  });
  TEAM_IAN.forEach((p, i) => {
    all.push({
      ...p,
      angle: (Math.PI * 2 * i) / TEAM_IAN.length + Math.PI / 6,
      speed: -(0.003 + Math.random() * 0.002),
      radius: 0.55 + Math.random() * 0.15,
      drift: (Math.random() - 0.5) * 0.001,
    });
  });
  return all;
}

export default function ColliderChamber() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>(initParticles());
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Collider idle");
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!running) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let active = true;

    function draw() {
      if (!active || !ctx || !canvas) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.38;

      // Clear
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // Draw chamber ring
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(99, 102, 241, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Update and draw particles
      particlesRef.current.forEach((p) => {
        if (!p.active) return;

        // Update angle
        p.angle += p.speed;
        p.radius += p.drift;

        // Clamp radius
        if (p.radius > 0.8) p.drift = -Math.abs(p.drift);
        if (p.radius < 0.4) p.drift = Math.abs(p.drift);

        const r = baseRadius * p.radius;
        const x = cx + Math.cos(p.angle) * r;
        const y = cy + Math.sin(p.angle) * r;

        // Depth: front arc is brighter
        const depth = (Math.sin(p.angle) + 1) / 2;
        const alpha = 0.4 + depth * 0.6;

        const color =
          p.team === "Dan"
            ? `rgba(59, 130, 246, ${alpha})`
            : `rgba(239, 68, 68, ${alpha})`;

        // Glow aura
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core (1px)
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fillStyle = p.team === "Dan" ? "#60a5fa" : "#f87171";
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      active = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [running]);

  function handleStart() {
    setRunning(true);
    setStatus("Initializing field...");
    setTimeout(() => setStatus("Orbital sync achieved"), 1500);
    setTimeout(() => setStatus("Collider active"), 3000);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Chamber */}
      <div className="relative w-[390px] max-w-[95vw] aspect-[3/4] rounded-2xl border border-border overflow-hidden"
        style={{ boxShadow: "0 0 40px rgba(99, 102, 241, 0.05), inset 0 0 60px rgba(0,0,0,0.5)" }}
      >
        <canvas
          ref={canvasRef}
          width={390}
          height={520}
          className="w-full h-full"
        />
      </div>

      {/* Controls */}
      {!running ? (
        <button
          onClick={handleStart}
          className="px-6 py-2 text-sm font-mono tracking-wider border border-indigo-500/30 rounded text-indigo-400 hover:bg-indigo-500/10 transition-colors"
        >
          Start Collider
        </button>
      ) : (
        <p className="text-xs font-mono text-zinc-500 tracking-wider">
          {status}
        </p>
      )}
    </div>
  );
}
