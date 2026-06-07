"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Bold, CornerDownLeft, Italic, Underline, Code } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  isTelegramHtmlEmpty,
  normalizeTelegramHtml,
  sanitizeStoredTelegramHtml,
  telegramHtmlToRenderHtml,
} from "@/lib/telegram-html";

type FormatCmd = "bold" | "italic" | "underline" | "code";

const MIN_HEIGHT_PX = 160;
const ZWSP = "\u200b";

function findCodeAncestor(node: Node | null, root: Node): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n instanceof HTMLElement && n.tagName === "CODE") return n;
    n = n.parentNode;
  }
  return null;
}

function unwrapElement(el: HTMLElement) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function ensureSelectionInEditor(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return null;
  if (sel.rangeCount === 0) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  }
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) {
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return range;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  /** Altura máxima del área editable (scroll interno). */
  maxHeight?: number;
}

export function TelegramRichEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
  disabled,
  maxHeight,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef(value);
  const minHeight = Math.max(MIN_HEIGHT_PX, rows * 28);

  const syncFromValue = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el) return;
    const html = telegramHtmlToRenderHtml(sanitizeStoredTelegramHtml(text));
    if (el.innerHTML !== html) {
      el.innerHTML = html || "";
    }
  }, []);

  // Carga inicial al montar (evita editor vacío al seleccionar un nodo)
  useLayoutEffect(() => {
    syncFromValue(value);
    lastEmittedRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  // Sync cuando el valor cambia desde afuera (otro nodo, reset, guardado)
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      syncFromValue(value);
      lastEmittedRef.current = value;
    }
  }, [value, syncFromValue]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const normalized = normalizeTelegramHtml(el.innerHTML);
    lastEmittedRef.current = normalized;
    onChange(normalized);
  }, [onChange]);

  const insertLineBreak = useCallback(() => {
    if (disabled) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const range = ensureSelectionInEditor(el);
    if (!range) return;

    range.deleteContents();
    const br = document.createElement("br");
    range.insertNode(br);
    const caret = document.createTextNode(ZWSP);
    br.parentNode?.insertBefore(caret, br.nextSibling);
    range.setStart(caret, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    emitChange();
  }, [disabled, emitChange]);

  const applyFormat = useCallback((cmd: FormatCmd) => {
    if (disabled) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    if (cmd === "code") {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      const codeEl =
        findCodeAncestor(range.startContainer, el) ??
        findCodeAncestor(range.endContainer, el);

      if (codeEl) {
        unwrapElement(codeEl);
        emitChange();
        return;
      }

      if (range.collapsed) return;

      const fragment = range.extractContents();
      const code = document.createElement("code");
      code.appendChild(fragment);
      range.insertNode(code);
      sel.removeAllRanges();
      const after = document.createRange();
      after.setStartAfter(code);
      after.collapse(true);
      sel.addRange(after);
    } else {
      const map: Record<Exclude<FormatCmd, "code">, string> = {
        bold: "bold",
        italic: "italic",
        underline: "underline",
      };
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand(map[cmd], false);
    }
    emitChange();
  }, [disabled, emitChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        insertLineBreak();
        return;
      }

      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        applyFormat("bold");
      } else if (key === "i") {
        e.preventDefault();
        applyFormat("italic");
      } else if (key === "u") {
        e.preventDefault();
        applyFormat("underline");
      }
    },
    [disabled, applyFormat, insertLineBreak],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      document.execCommand("insertText", false, text);
      emitChange();
    },
    [emitChange],
  );

  const BUTTONS: {
    cmd: FormatCmd;
    Icon: React.ComponentType<{ className?: string }>;
    label: string;
    shortcut?: string;
  }[] = [
    { cmd: "bold", Icon: Bold, label: "Negrita", shortcut: "B" },
    { cmd: "italic", Icon: Italic, label: "Cursiva", shortcut: "I" },
    { cmd: "underline", Icon: Underline, label: "Subrayado", shortcut: "U" },
    { cmd: "code", Icon: Code, label: "Código" },
  ];

  const showPlaceholder = isTelegramHtmlEmpty(value);

  return (
    <div className={cn("flex flex-col gap-2 min-h-0", className)}>
      <div className="flex gap-1 flex-wrap shrink-0">
        {BUTTONS.map(({ cmd, Icon, label, shortcut }) => (
          <Button
            key={cmd}
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title={shortcut ? `${label} (⌘/Ctrl+${shortcut})` : label}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat(cmd)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          title="Salto de línea (Enter)"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertLineBreak}
        >
          <CornerDownLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] text-zinc-400 self-center ml-1 leading-snug">
          Enter o ↵ = nueva línea · ⌘/Ctrl+B I U
        </span>
      </div>

      <div className="relative flex-1 min-h-0">
        {showPlaceholder && (
          <p
            className="pointer-events-none absolute inset-x-0 top-0 px-4 pt-3.5 text-sm text-zinc-400 leading-relaxed line-clamp-4"
            aria-hidden
          >
            {placeholder}
          </p>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-label="Mensaje Telegram"
          onInput={emitChange}
          onBlur={emitChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={cn(
            "w-full rounded-xl border border-violet-200/80 dark:border-violet-900/50",
            "bg-white dark:bg-zinc-900/80 px-4 py-3.5",
            "text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-100",
            "overflow-y-auto outline-none focus:ring-2 focus:ring-violet-500/30",
            "shadow-sm [&_b]:font-bold [&_i]:italic [&_u]:underline",
            "[&_code]:rounded [&_code]:bg-zinc-100 [&_code]:dark:bg-zinc-800",
            "[&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]",
            "[&_br]:block [&_br]:content-['']",
            disabled && "opacity-60 pointer-events-none",
          )}
          style={{
            minHeight,
            ...(maxHeight ? { maxHeight, overflowY: "auto" as const } : {}),
          }}
        />
      </div>
    </div>
  );
}
