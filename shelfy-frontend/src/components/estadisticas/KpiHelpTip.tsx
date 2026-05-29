"use client";

import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KpiHelpTipProps {
  text: string;
  side?: "top" | "right" | "bottom" | "left";
  size?: number;
}

export function KpiHelpTip({ text, side = "right", size = 13 }: KpiHelpTipProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Más información"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              margin: 0,
              border: "none",
              background: "transparent",
              color: "var(--shelfy-muted)",
              cursor: "help",
              flexShrink: 0,
              lineHeight: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <CircleHelp size={size} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-[260px] text-xs leading-relaxed font-normal"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
