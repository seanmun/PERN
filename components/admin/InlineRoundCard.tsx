'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Pencil } from 'lucide-react';
import { updateRoundField } from '@/lib/actions/rounds';

/**
 * Tap-to-edit value with auto-save on blur / Enter. Mounts as a static
 * label until clicked, then becomes the underlying control. Shows a
 * brief ✓ flash after the action returns. No submit button — the form
 * disappears the moment focus leaves.
 *
 * Used for every field on the round-edit card so the screen reads as
 * its content first, controls second.
 */
function useInlineSave(roundId: string, field: string) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [, startTransition] = useTransition();

  function save(value: string | null | undefined) {
    startTransition(async () => {
      setStatus('saving');
      const fd = new FormData();
      fd.set('id', roundId);
      fd.set('field', field);
      fd.set('value', value ?? '');
      try {
        await updateRoundField(fd);
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 1200);
      } catch (err) {
        console.error('Inline save failed', err);
        setStatus('idle');
      }
    });
  }

  return { status, save };
}

function StatusBadge({ status }: { status: 'idle' | 'saving' | 'saved' }) {
  if (status === 'saving')
    return <Loader2 size={11} className="animate-spin text-zinc-500" />;
  if (status === 'saved')
    return <Check size={12} className="text-emerald-500" />;
  return null;
}

export function InlineText({
  roundId,
  field,
  value,
  placeholder,
}: {
  roundId: string;
  field: string;
  value: string | null;
  placeholder?: string;
}) {
  const { status, save } = useInlineSave(roundId, field);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? '');

  if (editing) {
    return (
      <input
        autoFocus
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (local !== (value ?? '')) save(local);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setLocal(value ?? '');
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-sm border border-yellow-500/60 bg-white dark:bg-zinc-950 px-2 py-1 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1 text-left text-base text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700"
    >
      <span className={value ? '' : 'text-zinc-500 italic'}>
        {value || placeholder || 'Add…'}
      </span>
      <Pencil size={10} className="ml-auto text-zinc-400 opacity-0 group-hover:opacity-100" />
      <StatusBadge status={status} />
    </button>
  );
}

export function InlineDate({
  roundId,
  field,
  value,
}: {
  roundId: string;
  field: string;
  value: string;
}) {
  const { status, save } = useInlineSave(roundId, field);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (local !== value) save(local);
        }}
        className="w-full rounded-sm border border-yellow-500/60 bg-white dark:bg-zinc-950 px-2 py-1 text-base focus:outline-none"
      />
    );
  }

  const display = value
    ? new Date(value + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1 text-left text-base hover:border-zinc-300 dark:hover:border-zinc-700"
    >
      <span className={display ? '' : 'text-zinc-500 italic'}>
        {display || 'Add date…'}
      </span>
      <Pencil size={10} className="ml-auto text-zinc-400 opacity-0 group-hover:opacity-100" />
      <StatusBadge status={status} />
    </button>
  );
}

/**
 * Chip-picker: one tap per option, current selection filled, save fires
 * immediately. Replaces the dropdown for short option lists (formats,
 * courses, tees) so admin doesn't have to open and dismiss a select on
 * mobile.
 */
export function InlineChips({
  roundId,
  field,
  value,
  options,
  allowEmpty,
  emptyLabel,
}: {
  roundId: string;
  field: string;
  value: string | null;
  options: { value: string; label: string; sublabel?: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const { status, save } = useInlineSave(roundId, field);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {allowEmpty && (
          <ChipButton
            selected={value == null || value === ''}
            onClick={() => save('')}
          >
            {emptyLabel ?? 'Default'}
          </ChipButton>
        )}
        {options.map((opt) => (
          <ChipButton
            key={opt.value}
            selected={value === opt.value}
            onClick={() => save(opt.value)}
            sublabel={opt.sublabel}
          >
            {opt.label}
          </ChipButton>
        ))}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function ChipButton({
  children,
  sublabel,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  sublabel?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        selected
          ? 'border-yellow-500 bg-yellow-500 text-black'
          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:border-yellow-500/40'
      }`}
    >
      <span>{children}</span>
      {sublabel && (
        <span className={`text-[10px] font-normal ${selected ? 'text-black/70' : 'text-zinc-500'}`}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

export function InlineCheckbox({
  roundId,
  field,
  checked,
  label,
  hint,
}: {
  roundId: string;
  field: string;
  checked: boolean;
  label: string;
  hint?: string;
}) {
  const { status, save } = useInlineSave(roundId, field);
  const [local, setLocal] = useState(checked);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !local;
        setLocal(next);
        save(next ? 'on' : '');
      }}
      className={`flex w-full items-start gap-3 rounded-sm border px-3 py-3 text-left transition-colors ${
        local
          ? 'border-yellow-500/60 bg-yellow-500/10'
          : 'border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 hover:border-zinc-400 dark:hover:border-zinc-700'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
          local ? 'border-yellow-500 bg-yellow-500' : 'border-zinc-400 dark:border-zinc-600'
        }`}
      >
        {local && <Check size={12} className="text-black" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-800 dark:text-zinc-200">
          {label}
        </span>
        {hint && (
          <span className="block text-[11px] text-zinc-500">{hint}</span>
        )}
      </span>
      <StatusBadge status={status} />
    </button>
  );
}
