"use client";

import { useState, ReactNode } from "react";

export default function Tooltip({ label, children, placement = "top" }: { label: string; children: ReactNode; placement?: "top" | "bottom" }) {
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
          className={`absolute left-1/2 z-[1200] w-64 -translate-x-1/2 rounded-md border border-rail-line-bright bg-rail-panel-raised px-3 py-2 text-xs leading-snug text-text-primary shadow-2xl ${placement === "bottom" ? "top-full mt-3" : "bottom-full mb-2"}`}
        >
          {label}
          <span className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${placement === "bottom" ? "bottom-full border-b-rail-line-bright" : "top-full border-t-rail-line-bright"}`} />
        </span>
      )}
    </span>
  );
}
