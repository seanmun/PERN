'use client';

import { useState } from 'react';

export default function TeamColorPicker({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const [color, setColor] = useState(defaultValue);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        name={name}
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-10 w-14 cursor-pointer rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950"
      />
      <span className="font-mono text-xs uppercase tabular-nums text-zinc-600 dark:text-zinc-400">
        {color}
      </span>
    </div>
  );
}
