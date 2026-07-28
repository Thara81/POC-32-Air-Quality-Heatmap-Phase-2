"use client";

import { useState, ReactNode } from "react";

export default function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-md border border-rail-line-bright bg-rail-panel-raised px-3 py-2 text-[11px] leading-snug text-text-muted shadow-lg"
        >
          {label}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-rail-line-bright" />
        </span>
      )}
    </span>
  );
}
