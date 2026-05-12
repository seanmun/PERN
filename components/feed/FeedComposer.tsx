'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { Image as ImageIcon, MessageSquare, Send, X } from 'lucide-react';
import { createMediaPost, createTextPost } from '@/lib/actions/feed';

export type ComposerMatchOption = {
  id: string;
  label: string;
};

export default function FeedComposer({
  open,
  onClose,
  defaultMatchId,
  matchOptions,
}: {
  open: boolean;
  onClose: () => void;
  defaultMatchId?: string;
  matchOptions: ComposerMatchOption[];
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

  if (!open) return null;

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
      const blob = await upload(file.name, file, {
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

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-t-lg border border-zinc-800 bg-zinc-950 sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-yellow-500">
            New post
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-800 p-1.5 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            aria-label="Close composer"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex border-b border-zinc-800">
          <button
            type="button"
            onClick={() => setMode('media')}
            className={`flex flex-1 items-center justify-center gap-2 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest ${
              mode === 'media'
                ? 'bg-yellow-500/10 text-yellow-300'
                : 'text-zinc-500 hover:bg-zinc-900'
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
                : 'text-zinc-500 hover:bg-zinc-900'
            }`}
          >
            <MessageSquare size={14} /> Text
          </button>
        </div>

        <div className="space-y-4 p-4">
          {mode === 'media' ? (
            <>
              {mediaUrl ? (
                <div className="overflow-hidden rounded-sm border border-zinc-800 bg-black">
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
                  className="flex aspect-video w-full items-center justify-center rounded-sm border-2 border-dashed border-zinc-800 text-zinc-500 hover:border-yellow-500/50 hover:text-yellow-400 disabled:opacity-50"
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
    </div>
  );
}

const inputCls =
  'mt-2 block w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500';

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
