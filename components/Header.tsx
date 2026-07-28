import Tooltip from "./Tooltip";

export default function Header() {
  return (
    <header className="border-b border-rail-line bg-rail-void/80 backdrop-blur flex-shrink-0">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-signal-clear/40 bg-signal-clear/10">
            <span className="font-mono text-xs font-semibold text-signal-clear">AQ</span>
          </div>
          <div className="leading-tight">
            <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-text-faint leading-none">
              Real Rails Intelligence Library
            </p>
            <h1 className="text-sm font-semibold leading-tight text-text-primary">Air Quality Heatmap</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-wider text-text-muted">
          <Tooltip label="This demo is built on the Data & Intelligence rail: it reads live, publicly governed sensor and population data rather than a proprietary feed.">
            <span className="flex cursor-help items-center gap-1 rounded border border-rail-line px-1.5 py-0.5">
              <span className="h-1 w-1 rounded-full bg-signal-clear" />
              Rail: Data &amp; Intelligence
            </span>
          </Tooltip>
          <span className="hidden items-center gap-1 rounded border border-rail-line px-1.5 py-0.5 sm:flex">
            OpenAQ · WorldPop
          </span>
        </div>
      </div>
      <div className="h-px w-full bg-rail-track" />
    </header>
  );
}
