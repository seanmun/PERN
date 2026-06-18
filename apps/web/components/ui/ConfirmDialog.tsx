'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info } from 'lucide-react';

/**
 * Branded replacement for window.confirm — modal with project styling.
 *
 * Pass `open` to control visibility. `tone="danger"` makes the confirm
 * button red (use for destructive actions). Default tone keeps the
 * yellow primary look.
 *
 * Closes on Escape, click outside, or Cancel.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;
  if (typeof window === 'undefined') return null;

  const Icon = tone === 'danger' ? AlertTriangle : Info;
  const iconColor = tone === 'danger' ? 'text-red-400' : 'text-yellow-800 dark:text-yellow-400';
  const confirmBtn =
    tone === 'danger'
      ? 'bg-red-500 text-black hover:bg-red-400'
      : 'bg-yellow-500 text-black hover:bg-yellow-400';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        <div className="border-b border-zinc-200 dark:border-zinc-900 px-5 py-3">
          <div className="flex items-center gap-2">
            <Icon size={14} className={iconColor} strokeWidth={2.5} />
            <h2
              id="confirm-dialog-title"
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-900 dark:text-zinc-100"
            >
              {title}
            </h2>
          </div>
        </div>

        <p className="px-5 py-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {message}
        </p>

        <div className="flex items-center gap-2 border-t border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950/40 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-sm border border-zinc-400 dark:border-zinc-700 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`flex-1 rounded-sm px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest ${confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
