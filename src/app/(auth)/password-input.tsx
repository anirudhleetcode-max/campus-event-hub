"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Password input with an accessible show/hide toggle. */
export function PasswordInput({ value, onValueChange, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} value={value} onChange={(e) => onValueChange(e.target.value)} className={className ? `pr-10 ${className}` : "pr-10"} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={props.disabled}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
