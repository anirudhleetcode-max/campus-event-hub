"use client";

import * as React from "react";
import jsQR from "jsqr";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Keyboard, Loader2, RefreshCw, SwitchCamera, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { useRealtime } from "@/hooks/use-realtime";
import { checkInByCodeAction } from "@/app/actions/organizer";
import { cn, formatNumber, formatPercent, formatTime } from "@/lib/utils";
import type { ScanOutcome } from "./types";

type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "active" }
  | { status: "failed"; reason: "denied" | "unavailable" | "busy" | "error"; message: string };

type LogEntry = ScanOutcome & { id: number; time: string };

const FRAME_INTERVAL_MS = 125; // ~8 decodes per second
const SAME_CODE_COOLDOWN_MS = 3000;
const MAX_DECODE_WIDTH = 640;

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
}

function cameraError(err: unknown): Extract<CameraState, { status: "failed" }> {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { status: "failed", reason: "denied", message: "Camera permission was denied. Allow camera access in your browser's site settings, or check people in manually below." };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return { status: "failed", reason: "unavailable", message: "No camera was found on this device. Use manual entry below instead." };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return { status: "failed", reason: "busy", message: "The camera is being used by another app. Close it and try again." };
  }
  return { status: "failed", reason: "error", message: "The camera could not be started. Try again or use manual entry below." };
}

/**
 * Camera-based QR check-in. Frames from the rear camera are drawn to an
 * off-screen canvas and decoded with jsQR at ~8 fps; each new code is posted
 * to /api/attendance/scan (the server validates everything). The same code
 * is ignored for 3 seconds so a pass held in front of the camera is only
 * submitted once.
 */
export function QrScanner({ eventId, initial }: { eventId: string; initial: { registered: number; checkedIn: number } }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const lastFrameRef = React.useRef(0);
  const lastCodeRef = React.useRef<{ value: string; at: number } | null>(null);
  const inFlightRef = React.useRef(false);
  const logId = React.useRef(0);

  const [camera, setCamera] = React.useState<CameraState>({ status: "idle" });
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = React.useState(-1);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<LogEntry | null>(null);
  const [log, setLog] = React.useState<LogEntry[]>([]);
  const [counts, setCounts] = React.useState(initial);
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string>();
  const [manualPending, setManualPending] = React.useState(false);
  // True once the operator types after submitting, so a late success doesn't wipe their input.
  const editedSinceSubmit = React.useRef(false);

  const { connected } = useRealtime([`event:${eventId}:attendance`], (_t, data) => {
    if (typeof data.registered === "number" && typeof data.checkedIn === "number") setCounts({ registered: data.registered, checkedIn: data.checkedIn });
  });

  const stopCamera = React.useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Release the camera when leaving the page.
  React.useEffect(() => stopCamera, [stopCamera]);

  const record = React.useCallback((outcome: ScanOutcome) => {
    const entry: LogEntry = { ...outcome, id: ++logId.current, time: new Date().toISOString() };
    setResult(entry);
    setLog((l) => [entry, ...l].slice(0, 10));
    if (outcome.kind === "success") {
      vibrate(80);
      setCounts((c) => ({ ...c, checkedIn: Math.min(c.registered, c.checkedIn + 1) }));
    } else if (outcome.kind === "already") vibrate([60, 60, 60]);
    else vibrate(250);
  }, []);

  const submitScan = React.useCallback(
    async (payload: string) => {
      inFlightRef.current = true;
      setBusy(true);
      try {
        const res = await fetch("/api/attendance/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, payload }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          registration?: { participantName: string; code: string; checkInAt: string };
          error?: string;
          code?: string;
          details?: { participantName?: string; code?: string; checkInAt?: string };
        };
        if (res.ok && body.registration) {
          record({ kind: "success", name: body.registration.participantName, code: body.registration.code, at: body.registration.checkInAt });
        } else if (body.code === "ALREADY_CHECKED_IN") {
          record({
            kind: "already",
            message: body.error ?? "Already checked in.",
            name: body.details?.participantName ?? "",
            code: body.details?.code ?? "",
            at: body.details?.checkInAt,
          });
        } else {
          record({ kind: "error", message: body.error ?? "This pass could not be verified. Please try again." });
        }
      } catch {
        record({ kind: "error", message: "Network error — check your connection and scan again." });
      } finally {
        inFlightRef.current = false;
        setBusy(false);
      }
    },
    [eventId, record],
  );

  const decodeFrame = React.useCallback(
    (ts: number) => {
      if (ts - lastFrameRef.current < FRAME_INTERVAL_MS || inFlightRef.current) return;
      lastFrameRef.current = ts;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA || !video.videoWidth) return;
      const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const decoded = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      const value = decoded?.data?.trim();
      if (!value) return;
      const now = Date.now();
      const last = lastCodeRef.current;
      if (last && last.value === value && now - last.at < SAME_CODE_COOLDOWN_MS) return;
      lastCodeRef.current = { value, at: now };
      void submitScan(value);
    },
    [submitScan],
  );

  const startCamera = React.useCallback(
    async (deviceId?: string) => {
      stopCamera();
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCamera({
          status: "failed",
          reason: "unavailable",
          message: "This browser can't access the camera here (a secure HTTPS connection is required). Use manual entry below.",
        });
        return;
      }
      setCamera({ status: "starting" });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } },
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopCamera();
          return;
        }
        video.srcObject = stream;
        await video.play();
        setCamera({ status: "active" });
        const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        const cams = all.filter((d) => d.kind === "videoinput");
        setDevices(cams);
        const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        setDeviceIndex(cams.findIndex((d) => d.deviceId === activeId));
        lastFrameRef.current = 0;
        const loop = (ts: number) => {
          rafRef.current = requestAnimationFrame(loop);
          decodeFrame(ts);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        stopCamera();
        setCamera(cameraError(err));
      }
    },
    [stopCamera, decodeFrame],
  );

  function switchCamera() {
    if (devices.length < 2) return;
    const next = (deviceIndex + 1) % devices.length;
    setDeviceIndex(next);
    void startCamera(devices[next]!.deviceId);
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (manualPending) return;
    const value = code.trim().toUpperCase();
    if (!/^(REG-)?[A-Z0-9]{4,16}$/.test(value)) {
      setCodeError("Enter a registration ID like REG-7KD2QX9M");
      return;
    }
    setManualPending(true);
    setCodeError(undefined);
    editedSinceSubmit.current = false;
    try {
      const res = await checkInByCodeAction(eventId, value);
      if (res.ok) {
        record(res.data);
        // The live update can show the result before this resolves; don't wipe what the
        // operator has typed since submitting.
        if (res.data.kind === "success" && !editedSinceSubmit.current) setCode("");
      } else record({ kind: "error", message: res.error });
    } catch {
      record({ kind: "error", message: "Network error — check your connection and try again." });
    } finally {
      setManualPending(false);
    }
  }

  const rate = counts.registered ? counts.checkedIn / counts.registered : 0;
  const active = camera.status === "active";

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="overflow-hidden">
          <div className="relative aspect-[4/3] w-full bg-black sm:aspect-video">
            <video ref={videoRef} className={cn("h-full w-full object-cover", !active && "invisible")} playsInline muted aria-label="Camera preview" />
            <canvas ref={canvasRef} className="hidden" aria-hidden />
            {active && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                <div className="size-56 max-h-[70%] max-w-[70%] rounded-2xl border-4 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] sm:size-64" />
              </div>
            )}
            {!active && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
                {camera.status === "starting" ? (
                  <>
                    <Loader2 className="size-8 animate-spin" aria-hidden />
                    <p className="text-sm">Starting camera… allow access if your browser asks.</p>
                  </>
                ) : camera.status === "failed" ? (
                  <>
                    <CameraOff className="size-10 opacity-80" aria-hidden />
                    <p className="max-w-sm text-sm" role="alert">
                      {camera.message}
                    </p>
                    {camera.reason !== "unavailable" && (
                      <Button variant="secondary" onClick={() => void startCamera()}>
                        <RefreshCw /> Try again
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Camera className="size-10 opacity-80" aria-hidden />
                    <p className="max-w-xs text-sm opacity-90">Point the camera at a participant&apos;s QR pass. Check-ins are recorded automatically.</p>
                    <Button onClick={() => void startCamera()} size="lg">
                      <Camera /> Start scanning
                    </Button>
                  </>
                )}
              </div>
            )}
            {busy && (
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Verifying…
              </div>
            )}
          </div>
          {active && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Hold the pass steady inside the frame.</p>
              <div className="flex gap-2">
                {devices.length > 1 && (
                  <Button variant="outline" size="sm" onClick={switchCamera}>
                    <SwitchCamera /> Switch camera
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => (stopCamera(), setCamera({ status: "idle" }))}>
                  <CameraOff /> Stop
                </Button>
              </div>
            </div>
          )}
        </Card>

        <ResultCard result={result} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="size-4" aria-hidden /> Manual entry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitManual} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
              <Field label="Registration ID" htmlFor="manual-code" error={codeError} hint="Printed under the QR code on the participant's pass." className="flex-1">
                <Input
                  value={code}
                  onChange={(e) => {
                    editedSinceSubmit.current = true;
                    setCode(e.target.value);
                    setCodeError(undefined);
                  }}
                  placeholder="REG-7KD2QX9M"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={20}
                  className="font-mono uppercase"
                />
              </Field>
              <Button type="submit" loading={manualPending} className="sm:mt-6">
                Check in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Checked in</CardTitle>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <span className={connected ? "size-2 animate-pulse-dot rounded-full bg-success" : "size-2 rounded-full bg-border-strong"} aria-hidden />
              {connected ? "Live" : "Connecting…"}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold tabular-nums" aria-live="polite">
              {formatNumber(counts.checkedIn)} <span className="text-base font-normal text-muted-foreground">/ {formatNumber(counts.registered)}</span>
            </p>
            <Progress value={rate} tone="success" label="Attendance rate" />
            <p className="text-xs text-muted-foreground">
              {formatPercent(rate)} attendance · {formatNumber(Math.max(0, counts.registered - counts.checkedIn))} not checked in yet
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This session</CardTitle>
          </CardHeader>
          <CardContent>
            {log.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Your last 10 scans will appear here.</p>
            ) : (
              <ol className="divide-y divide-border" aria-label="Recent scans">
                {log.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    {l.kind === "success" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Checked in" />
                    ) : l.kind === "already" ? (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Already checked in" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Rejected" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.kind === "error" ? "Rejected" : l.name || l.code}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {l.kind === "success" ? <span className="font-mono">{l.code}</span> : l.message}
                      </p>
                    </div>
                    <time dateTime={l.time} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatTime(l.time)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: LogEntry | null }) {
  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground" aria-live="polite">
        Scan results will appear here.
      </div>
    );
  }
  const tone =
    result.kind === "success"
      ? { cls: "border-success/40 bg-success-soft text-success-soft-foreground", Icon: CheckCircle2, heading: "Checked in" }
      : result.kind === "already"
        ? { cls: "border-warning/50 bg-warning-soft text-warning-soft-foreground", Icon: AlertTriangle, heading: "Already checked in" }
        : { cls: "border-danger/40 bg-danger-soft text-danger-soft-foreground", Icon: XCircle, heading: "Entry not allowed" };
  return (
    <div key={result.id} role={result.kind === "error" ? "alert" : "status"} aria-live="assertive" className={cn("flex items-start gap-4 rounded-xl border-2 p-5", tone.cls)}>
      <tone.Icon className="size-10 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-sm font-semibold tracking-wide uppercase">{tone.heading}</h3>
        {result.kind === "error" ? (
          <p className="text-base font-medium">{result.message}</p>
        ) : (
          <>
            {result.name && <p className="text-2xl leading-tight font-semibold break-words">{result.name}</p>}
            <p className="text-sm">
              {result.code && <span className="font-mono">{result.code}</span>}
              {result.at && (
                <>
                  {result.code ? " · " : ""}
                  {result.kind === "already" ? "originally at " : "at "}
                  {formatTime(result.at)}
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
