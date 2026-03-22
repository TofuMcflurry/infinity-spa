import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

function Calendar({ className, classNames, showOutsideDays = false, ...props }) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-full", className)}
      classNames={{
        // Wrapper
        months:     "w-full",
        month:      "w-full",
        month_grid: "w-full",
        monthGrid:  "w-full",

        // Caption / title row  ← justify-between keeps title left, nav right
        month_caption: "flex items-center justify-between px-1 pb-3",
        caption:       "flex items-center justify-between px-1 pb-3",
        caption_label: "text-sm font-semibold font-display",

        // Nav wrapper
        nav: "flex items-center gap-1",

        // v8 nav buttons (no absolute positioning — stay inside flex nav)
        nav_button: cn(
          "h-7 w-7 rounded-md border border-white/10 bg-transparent",
          "flex items-center justify-center",
          "opacity-60 hover:opacity-100 transition-opacity"
        ),
        nav_button_previous: "",
        nav_button_next:     "",

        // v9 nav buttons
        button_previous: cn(
          "h-7 w-7 rounded-md border border-white/10 bg-transparent",
          "flex items-center justify-center",
          "opacity-60 hover:opacity-100 transition-opacity"
        ),
        button_next: cn(
          "h-7 w-7 rounded-md border border-white/10 bg-transparent",
          "flex items-center justify-center",
          "opacity-60 hover:opacity-100 transition-opacity"
        ),

        // ── ALIGNMENT FIX: grid-cols-7 on BOTH header and rows ──
        // v8
        head_row:  "grid grid-cols-7 w-full",
        head_cell: "flex items-center justify-center h-9 w-full text-muted-foreground font-normal text-xs",
        row:       "grid grid-cols-7 w-full mt-0.5",
        cell:      "flex items-center justify-center h-9 w-full p-0",

        // v9 equivalents
        weekdays: "grid grid-cols-7 w-full",
        weekday:  "flex items-center justify-center h-9 w-full text-muted-foreground font-normal text-xs",
        week:     "grid grid-cols-7 w-full mt-0.5",
        day:      "flex items-center justify-center h-9 w-full p-0",

        // The actual clickable button inside each cell
        day_button: cn(
          "h-8 w-8 rounded-full text-sm font-normal transition-colors",
          "hover:bg-gold/20 hover:text-gold",
          "focus-visible:outline-none"
        ),

        // Selected
        day_selected: "!bg-gold !text-primary-foreground hover:!bg-gold rounded-full",
        selected:     "!bg-gold !text-primary-foreground hover:!bg-gold rounded-full",

        // Today
        day_today: "bg-white/10 text-white font-semibold rounded-full",
        today:     "bg-white/10 text-white font-semibold rounded-full",

        // Outside / disabled
        day_outside: "opacity-25 pointer-events-none",
        outside:     "opacity-25 pointer-events-none",
        day_disabled:"opacity-25 cursor-not-allowed pointer-events-none",
        disabled:    "opacity-25 cursor-not-allowed pointer-events-none",
        day_hidden:  "invisible",
        hidden:      "invisible",

        ...classNames,
      }}
      components={{
        // v8
        IconLeft:  () => <ChevronLeft  className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
        // v9 — single Chevron component with orientation prop
        Chevron: ({ orientation }) =>
          orientation === "left"
            ? <ChevronLeft  className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";
export { Calendar };