"use client";

import { useState } from "react";
import Tooltip from "./Tooltip";

export default function Header() {
  const [showSignature, setShowSignature] = useState(false);

  return (
    <header className="absolute inset-x-0 top-0 z-[1100] border-b border-rail-line/70 bg-rail-void/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded border border-signal-clear/50 bg-signal-clear/10 shadow-[0_0_20px_rgba(103,218,190,0.12)]">
            <span className="font-mono text-sm font-semibold text-signal-clear">AI</span>
          </div>
          <div className="leading-tight">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal-clear leading-none">
              Infocreon Internship
            </p>
            <h1 className="text-lg font-semibold leading-tight text-text-primary">Air Quality Intelligence Platform</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          <Tooltip placement="bottom" label="This platform reads live, publicly governed sensor and population data rather than a proprietary feed.">
            <span className="flex cursor-help items-center gap-2 rounded border border-rail-line px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-clear" />
              Rail: Environmental Intelligence
            </span>
          </Tooltip>
          <span className="hidden items-center gap-1 rounded border border-rail-line px-1.5 py-0.5 sm:flex">
            OpenAQ · WorldPop
          </span>
          <button
            type="button"
            aria-label="Open developer signature"
            onClick={() => setShowSignature(true)}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-signal-clear/60 text-base font-semibold text-signal-clear transition hover:bg-signal-clear/15"
          >
            i
          </button>
        </div>
      </div>
      <div className="h-px w-full bg-rail-track" />

      {showSignature && (
        <div className="absolute right-4 top-[4.5rem] w-72 rounded-lg border border-rail-line-bright bg-rail-panel p-4 shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-signal-clear">Developer signature</p>
              <h2 className="mt-1 text-base font-semibold text-text-primary">Infocreon Internship</h2>
            </div>
            <button type="button" aria-label="Close developer signature" onClick={() => setShowSignature(false)} className="focus-ring text-lg leading-none text-text-muted hover:text-text-primary">×</button>
          </div>
          <dl className="mt-4 space-y-3 border-t border-rail-line pt-3 font-mono text-sm">
            <div className="flex justify-between gap-3"><dt className="text-text-faint">Architect</dt><dd className="text-right text-text-primary">Thara Asharaf</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-text-faint">POC ID</dt><dd className="text-text-primary">32</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-text-faint">GitHub</dt><dd className="text-text-primary">Thara81</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-text-faint">Stack</dt><dd className="max-w-[170px] text-right text-text-primary">Next.js · FastAPI · Tailwind · Leaflet · Recharts</dd></div>
          </dl>
        </div>
      )}
    </header>
  );
}
