"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface MobileDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function MobileDetailSheet({
  open,
  onOpenChange,
  title,
  children,
}: MobileDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[88dvh] rounded-t-2xl border-[var(--shelfy-border)]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-3 h-[calc(88dvh-5rem)] overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
