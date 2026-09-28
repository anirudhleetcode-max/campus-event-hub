"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Copies a value (or a same-origin path turned into an absolute URL) to the clipboard. */
export function CopyButton({ value, path, label = "Copy", successMessage = "Copied to clipboard", variant = "ghost", size = "sm", className }: {
  value?: string;
  path?: string;
  label?: string;
  successMessage?: string;
} & Pick<ButtonProps, "variant" | "size" | "className">) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    const text = path ? new URL(path, window.location.origin).toString() : (value ?? "");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(successMessage);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically. Please copy it manually.", { description: text });
    }
  }
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={copy}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {label}
    </Button>
  );
}
