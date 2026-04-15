"use client"

import * as React from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/Button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex flex-col sm:flex-row gap-4 relative", defaultClassNames.months),
        month_caption: cn(
          "flex justify-center items-center h-9 relative",
          defaultClassNames.month_caption
        ),
        caption_label: cn("text-sm font-semibold", defaultClassNames.caption_label),
        nav: cn(
          "flex items-center absolute inset-x-0 top-0 justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 p-0 opacity-50 hover:opacity-100",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 p-0 opacity-50 hover:opacity-100",
          defaultClassNames.button_next
        ),
        month_grid: cn("w-full border-collapse mt-2", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground w-9 font-normal text-[0.8rem] text-center py-1",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-1", defaultClassNames.week),
        day: cn(
          "relative w-9 h-9 p-0 text-center text-sm",
          defaultClassNames.day
        ),
        day_button: cn(
          "w-9 h-9 p-0 font-normal rounded-md transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          defaultClassNames.day_button
        ),
        selected: cn(
          "[&>button]:bg-primary [&>button]:text-primary-foreground",
          "[&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
          defaultClassNames.selected
        ),
        today: cn(
          "[&>button]:bg-accent [&>button]:text-accent-foreground",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-30 pointer-events-none",
          defaultClassNames.disabled
        ),
        range_start: cn("day-range-start", defaultClassNames.range_start),
        range_end: cn("day-range-end", defaultClassNames.range_end),
        range_middle: cn(
          "rounded-none bg-accent text-accent-foreground",
          "[&>button]:bg-transparent [&>button]:hover:bg-transparent",
          defaultClassNames.range_middle
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
