'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { ImageUp, X } from 'lucide-react';
import { compressImage } from '@/lib/upload/compress';

export default function ImagePickerInput({
  name,
  defaultValue,
  value,
  onChange,
  aspect = '16/9',
}: {
  name: string;
  defaultValue?: string;
  // Optional controlled mode: parent owns the URL state. Useful when a
  // sibling component (e.g. portrait generator) needs the live upload URL
  // before the form is saved.
  value?: string;
  onChange?: (url: string) => void;
  aspect?: string;
}) {
  const isControlled = value !== undefined;
  const [internalUrl, setInternalUrl] = useState<string>(defaultValue ?? '');
  const url = isControlled ? (value ?? '') : internalUrl;

  function setUrl(next: string) {
    if (isControlled) {
      onChange?.(next);
    } else {
      setInternalUrl(next);
      onChange?.(next);
    }
  }

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const toUpload = await compressImage(file);
      const blob = await upload(toUpload.name, toUpload, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });
      setUrl(blob.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function clear() {
    setUrl('');
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={url} />

      <div
        className="w-full overflow-hidden rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950"
        style={{ aspectRatio: aspect }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <ImageUp size={28} strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-1 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-yellow-800 dark:text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : url ? 'Replace image' : 'Upload image'}
        </button>
        {url && (
          <button
            type="button"
            onClick={clear}
            className="rounded-sm border border-zinc-300 dark:border-zinc-800 p-2 text-zinc-600 dark:text-zinc-400 hover:border-red-700/40 hover:text-red-400"
            aria-label="Remove image"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFileSelect}
        className="hidden"
      />

      <label className="block">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          …or paste a URL
        </span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="mt-2 block w-full rounded-sm border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
        />
      </label>

      {error && (
        <p className="font-mono text-[11px] text-red-400">{error}</p>
      )}
    </div>
  );
}
