"use client";

import * as React from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type ImageUploadKind = "banner" | "gallery" | "logo" | "avatar" | "signature";

/** Client-side mirrors of the server rules (the server re-validates everything). */
const RULES: Record<ImageUploadKind, { maxBytes: number; aspect: number; minText: string }> = {
  banner: { maxBytes: 5 * 1024 * 1024, aspect: 8 / 3, minText: "at least 800×300 px" },
  gallery: { maxBytes: 5 * 1024 * 1024, aspect: 4 / 3, minText: "at least 400×300 px" },
  logo: { maxBytes: 2 * 1024 * 1024, aspect: 1, minText: "at least 64×64 px" },
  avatar: { maxBytes: 2 * 1024 * 1024, aspect: 1, minText: "at least 64×64 px" },
  signature: { maxBytes: 1024 * 1024, aspect: 3, minText: "at least 100×30 px" },
};
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

type Props = {
  kind: ImageUploadKind;
  /** Current image URL ("" / null when empty). */
  value: string | null | undefined;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  /** Preview width / height ratio. Defaults per kind (e.g. 8/3 for banners, 1 for avatars). */
  aspect?: number;
  id?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  /** Called while an upload is in flight so parent forms can block submit. */
  onUploadingChange?: (uploading: boolean) => void;
};

type UploadResponse = { url: string; width: number; height: number } | { error: string };

function uploadWithProgress(file: File, kind: ImageUploadKind, onProgress: (pct: number) => void, signal: AbortSignal): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    xhr.open("POST", "/api/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as UploadResponse | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && "url" in body) resolve({ url: body.url });
      else reject(new Error(body && "error" in body && body.error ? body.error : "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(fd);
  });
}

/**
 * Image picker with preview, drag & drop, client-side type/size checks, upload
 * progress and removal. Uploads to POST /api/uploads and reports the stored URL.
 */
export function ImageUpload({ kind, value, onChange, label, hint, aspect, id, disabled, error, className, onUploadingChange }: Props) {
  const autoId = React.useId();
  const inputId = id ?? `upload-${autoId}`;
  const rule = RULES[kind];
  const ratio = aspect ?? rule.aspect;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [localError, setLocalError] = React.useState<string>();
  const [localPreview, setLocalPreview] = React.useState<string | null>(null);

  const uploading = progress !== null;
  const shownError = localError ?? error;
  const preview = localPreview ?? (value || null);
  const maxMb = Math.round(rule.maxBytes / 1024 / 1024);
  const hintText = hint ?? `PNG, JPEG or WebP · up to ${maxMb} MB · ${rule.minText}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  React.useEffect(() => () => abortRef.current?.abort(), []);
  React.useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  async function handleFile(file: File | undefined) {
    if (!file || disabled || uploading) return;
    setLocalError(undefined);
    if (!ACCEPT.includes(file.type)) {
      setLocalError("Only PNG, JPEG or WebP images are allowed.");
      return;
    }
    if (file.size > rule.maxBytes) {
      setLocalError(`The image must be smaller than ${maxMb} MB.`);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLocalPreview(URL.createObjectURL(file));
    setProgress(0);
    onUploadingChange?.(true);
    try {
      const { url } = await uploadWithProgress(file, kind, setProgress, controller.signal);
      onChange(url);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setLocalPreview(null);
      setProgress(null);
      onUploadingChange?.(false);
      abortRef.current = null;
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const round = kind === "avatar";

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className={cn("flex gap-4", round ? "items-center" : "flex-col")}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "relative overflow-hidden border-2 border-dashed bg-surface-2 transition-colors",
            round ? "size-24 shrink-0 rounded-full" : "w-full rounded-xl",
            dragging ? "border-primary bg-primary-soft" : shownError ? "border-danger/60" : "border-border-strong",
          )}
          style={round ? undefined : { aspectRatio: String(ratio) }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`${label} preview`} className={cn("size-full object-cover", uploading && "opacity-60")} />
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
              aria-describedby={hintId}
            >
              <ImagePlus className="size-6" aria-hidden />
              {!round && (
                <span className="text-sm">
                  <span className="font-medium text-primary">Choose an image</span> or drag it here
                </span>
              )}
              {round && <span className="sr-only">Choose an image</span>}
            </button>
          )}
          {uploading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/60 text-sm font-medium" aria-live="polite">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <span>{progress}%</span>
              {!round && (
                <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className={cn("flex flex-wrap items-center gap-2", round && "flex-col items-start")}>
          <div className="flex flex-wrap gap-2">
            {(preview || round) && (
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled || uploading}>
                {preview ? <RefreshCw aria-hidden /> : <ImagePlus aria-hidden />}
                {preview ? "Replace" : "Upload"}
              </Button>
            )}
            {uploading && (
              <Button type="button" variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            )}
            {value && !uploading && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => {
                  setLocalError(undefined);
                  onChange("");
                }}
                disabled={disabled}
              >
                <Trash2 aria-hidden />
                Remove
              </Button>
            )}
          </div>
          {round && !shownError && (
            <p id={hintId} className="text-xs text-muted-foreground">
              {hintText}
            </p>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled || uploading}
        aria-describedby={shownError ? errorId : hintId}
        aria-invalid={shownError ? true : undefined}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {!round && !shownError && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hintText}
        </p>
      )}
      {shownError && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {shownError}
        </p>
      )}
    </div>
  );
}
