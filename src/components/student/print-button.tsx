"use client";

import { Printer } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function PrintButton({ label = "Print", variant = "outline", size = "md", className }: { label?: string } & Pick<ButtonProps, "variant" | "size" | "className">) {
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={() => window.print()}>
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
