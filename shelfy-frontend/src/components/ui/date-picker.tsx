"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { Button } from "@/components/ui/Button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type DatePickerProps = {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minDate?: string
}

function parseIsoDate(iso?: string): Date | undefined {
  if (!iso) return undefined
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  minDate,
}: DatePickerProps) {
  const selectedDate = parseIsoDate(value)
  const min = parseIsoDate(minDate)
  const [timeZone, setTimeZone] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedDate && "text-[var(--shelfy-muted)]"
            )}
          >
            <CalendarIcon data-icon="inline-start" />
            {selectedDate ? format(selectedDate, "yyyy-MM-dd") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return
              const y = date.getFullYear()
              const m = String(date.getMonth() + 1).padStart(2, "0")
              const d = String(date.getDate()).padStart(2, "0")
              onChange(`${y}-${m}-${d}`)
            }}
            disabled={min ? { before: min } : undefined}
            timeZone={timeZone}
          />
        </PopoverContent>
      </Popover>
      {!!selectedDate && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange("")}
          aria-label="Limpiar fecha"
          className="shrink-0 text-[var(--shelfy-muted)] hover:text-red-500"
        >
          <X />
        </Button>
      )}
    </div>
  )
}
