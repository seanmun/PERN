"use client";

import { useState } from "react";
import type { EventLog as EventLogType } from "@/types";

interface EventLogProps {
  events: EventLogType[];
}

export default function EventLog({ events }: EventLogProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full max-w-[390px] mx-auto">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-mono tracking-widest text-zinc-500 uppercase hover:text-zinc-400 transition-colors"
      >
        <span className="transition-transform" style={{ transform: open ? "rotate(90deg)" : "rotate(0)" }}>
          ▸
        </span>
        Event Log
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-xs text-zinc-700 italic">No events recorded</p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="text-xs font-mono text-zinc-600 flex gap-2"
              >
                <span className="text-zinc-700 shrink-0">
                  {new Date(event.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>{event.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
