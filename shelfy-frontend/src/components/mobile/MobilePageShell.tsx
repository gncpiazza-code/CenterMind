"use client";

import { cn } from "@/lib/utils";

interface MobilePageShellProps {
  children: React.ReactNode;
  className?: string;
}

export function MobilePageShell({ children, className }: MobilePageShellProps) {
  return (
    <main className={cn("flex-1 min-h-0 overflow-y-auto pb-safe-nav", className)}>
      {children}
    </main>
  );
}
