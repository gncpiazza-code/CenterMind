"use client";

import { useRef } from "react";
import { Bold, Italic, Underline, Code } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

type Tag = "b" | "i" | "u" | "s" | "code";

export function TelegramRichEditor({ value, onChange, placeholder, rows = 4, className, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (tag: Tag) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    // Toggle: if already wrapped, unwrap
    if (selected.startsWith(open) && selected.endsWith(close)) {
      const inner = selected.slice(open.length, -close.length);
      onChange(value.slice(0, start) + inner + value.slice(end));
    } else {
      onChange(value.slice(0, start) + open + selected + close + value.slice(end));
    }
    // Restore cursor
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + open.length, end + open.length);
    }, 0);
  };

  const BUTTONS: { tag: Tag; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { tag: "b", Icon: Bold, label: "Negrita" },
    { tag: "i", Icon: Italic, label: "Cursiva" },
    { tag: "u", Icon: Underline, label: "Subrayado" },
    { tag: "code", Icon: Code, label: "Código" },
  ];

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-1 flex-wrap">
        {BUTTONS.map(({ tag, Icon, label }) => (
          <Button
            key={tag}
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title={label}
            disabled={disabled}
            onClick={() => wrapSelection(tag)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        <span className="text-xs text-zinc-400 self-center ml-1">
          Telegram: negrita, cursiva, subrayado, código
        </span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="font-mono text-sm resize-none"
      />
    </div>
  );
}
