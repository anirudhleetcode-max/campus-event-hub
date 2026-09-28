"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";

const subscribe = () => () => undefined;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const Icon = !mounted ? Sun : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Icon />
        </Button>
      </DropdownTrigger>
      <DropdownContent className="min-w-36">
        {[
          { v: "light", label: "Light", I: Sun },
          { v: "dark", label: "Dark", I: Moon },
          { v: "system", label: "System", I: Laptop },
        ].map(({ v, label, I }) => (
          <DropdownItem key={v} onSelect={() => setTheme(v)} className={mounted && theme === v ? "font-semibold" : undefined}>
            <I /> {label}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
