'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { Image as ImageIcon, MessageSquare, Send, X } from 'lucide-react';
import { createMediaPost, createTextPost } from '@/lib/actions/feed';
import { compressImage } from '@/lib/upload/compress';

export type ComposerMatchOption = {
  id: string;
  label: string;
};

export default function FeedComposer({
  open,
  onClose,
  defaultMatchId,
  matchOptions,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  defaultMatchId?: string;
  matchOptions: ComposerMatchOption[];
  tripId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'media' | 'text'>('media');
  const [body, setBody] = useState('');
  const [caption, setCaption] = useState('');
  const [matchId, setMatchId] = useState<string>(defaultMatchId ?? '');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Lock body scroll and hide the bottom nav while open so neither bounces
  // nor occludes the submit footer.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove('modal-open');
    };
  }, [open]);

  if (!open || !mounted) return null;

  function reset() {
    setBody('');
    setCaption('');
    setMatchId(defaultMatchId ?? '');
    setMediaUrl(null);
    setMediaType(null);
    setError(null);
  }

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const toUpload = file.type.startsWith('image/')
        ? await compressImage(file)
        : file;
      const blob = await upload(toUpload.name, toUpload, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });
      setMediaUrl(blob.url);
      setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit() {
    setError(null);
    if (mode === 'media') {
      if (!mediaUrl) {
        setError('Add a photo or video first.');
        return;
      }
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('url', mediaUrl);
      fd.set('mediaType', mediaType ?? 'image');
      if (caption.trim()) fd.set('caption', caption.trim());
      if (matchId) fd.set('matchId', matchId);
      startTransition(async () => {
        try {
          await createMediaPost(fd);
          reset();
          onClose();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Post failed');
        }
      });
    } else {
      const text = body.trim();
      if (!text) {
        setError('Write something to post.');
        return;
      }
      const fd = new FormData();
      fd.set('tripId', tripId);
      fd.set('body', text);
      startTransition(async () => {
        try {
          await createTextPost(fd);
          reset();
          onClose();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Post failed');
        }
      });
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center">
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 sm:rounded-lg"
        style={{ height: 'min(85svh, 720px)' }}
      >
        {/* Sticky header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-300 dark:border-zinc-800 px-4 py-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-yellow-500">
            New post
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-300 dark:border-zinc-800 p-1.5 text-zinc-600 dark:text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            aria-label="Close composer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Sticky tabs */}
        <div className="flex shrink-0 border-b border-zinc-300 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setMode('media')}
            className={`flex flex-1 items-center justify-center gap-2 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest ${
              mode === 'media'
                ? 'bg-yellow-500/10 text-yellow-300'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <ImageIcon size={14} /> Photo / video
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`flex flex-1 items-center justify-center gap-2 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest ${
              mode === 'text'
                ? 'bg-yellow-500/10 text-yellow-300'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <MessageSquare size={14} /> Text
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {mode === 'media' ? (
            <>
              {mediaUrl ? (
                <div className="overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-black">
                  {mediaType === 'video' ? (
                    <video
                      src={mediaUrl}
                      controls
                      className="aspect-video w-full"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl}
                      alt="upload preview"
                      className="aspect-video w-full object-cover"
                    />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-video w-full items-center justify-center rounded-sm border-2 border-dashed border-zinc-300 dark:border-zinc-800 text-zinc-500 hover:border-yellow-500/50 hover:text-yellow-400 disabled:opacity-50"
                >
                  <span className="text-sm">
                    {uploading ? 'Uploading…' : 'Tap to choose photo or video'}
                  </span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                onChange={onFileSelect}
                className="hidden"
              />

              <Field label="Caption (optional)">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={2}
                  placeholder="“Watch this slice”"
                  className={inputCls + ' resize-none'}
                />
              </Field>
            </>
          ) : (
            <Field label="Your post">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="“D-Bags getting smoked.”"
                className={inputCls + ' resize-none'}
              />
            </Field>
          )}

          {mode === 'media' && matchOptions.length > 0 && (
            <Field label="Tag a match (optional)">
              <select
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                className={inputCls}
              >
                <option value="">— none —</option>
                {matchOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {error && (
            <p className="font-mono text-[11px] text-red-400">{error}</p>
          )}
        </div>

        {/* Sticky footer with submit */}
        <div
          className="shrink-0 border-t border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={isPending || uploading}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-yellow-500 px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-yellow-400 disabled:opacity-50"
          >
            <Send size={12} />
            {isPending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
