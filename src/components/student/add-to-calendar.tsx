"use client";

import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /** ISO timestamps */
  startsAt: string;
  endsAt: string;
};

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
function escapeText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC basic format: 20261010T043000Z */
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Fold content lines longer than 75 octets (RFC 5545 §3.1), without splitting UTF-8 sequences. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(e: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Campus Event Hub//Registration//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(e.uid)}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(e.endsAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`Reminder: ${e.title}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function AddToCalendarButton({ event, filename, variant = "outline", size = "md", className }: { event: CalendarEvent; filename: string } & Pick<ButtonProps, "variant" | "size" | "className">) {
  function download() {
    try {
      const withUrl = event.url && event.url.startsWith("/") ? { ...event, url: new URL(event.url, window.location.origin).toString() } : event;
      const blob = new Blob([buildIcs(withUrl)], { type: "text/calendar;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename.replace(/[^A-Za-z0-9._-]+/g, "-") + (filename.endsWith(".ics") ? "" : ".ics");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast.success("Calendar file downloaded", { description: "Open it to add the event to your calendar." });
    } catch {
      toast.error("Couldn't create the calendar file. Please try again.");
    }
  }
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={download}>
      <CalendarPlus aria-hidden />
      Add to calendar
    </Button>
  );
}
