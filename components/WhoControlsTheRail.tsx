export default function WhoControlsTheRail() {
  return (
    <section className="rounded-lg border border-rail-line bg-rail-panel p-6">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-signal-warn">Who controls the rail</p>
      <h2 className="mb-3 text-base font-semibold text-text-primary">This dashboard is only as honest as its upstream data</h2>

      <div className="grid gap-4 text-sm leading-relaxed text-text-muted sm:grid-cols-2">
        <div>
          <p className="mb-1 font-mono text-xs font-semibold text-text-primary">OpenAQ (air quality readings)</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Nonprofit aggregator, not a sensor operator — it re-publishes feeds from government agencies, research networks, and community projects.</li>
            <li>Coverage is uneven: dense in the US, EU, and India; sparse across much of Sub-Saharan Africa and parts of Southeast Asia.</li>
            <li>Data is licensed CC BY 4.0. The v3 API requires a free key and applies rate limits.</li>
            <li>A station going offline silently reduces coverage — this demo surfaces station count so gaps are visible, not smoothed over.</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 font-mono text-xs font-semibold text-text-primary">WorldPop (population weighting)</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Research group at the University of Southampton; funded through a mix of academic and development-agency grants.</li>
            <li>Population figures are modeled estimates from census and satellite data, not a live census — the year of the estimate matters.</li>
            <li>Open data, but the stats API can be slow or unavailable, which is why the exposure score degrades gracefully to "partial."</li>
          </ul>
        </div>
      </div>

      <p className="mt-4 rounded-md border border-signal-warn/30 bg-signal-warn/5 p-3 text-xs text-text-muted">
        Read the score as a rough, population-aware signal for exploration — not a regulatory or medical
        determination. Where a city shows "no live data," that reflects a gap in public monitoring, not necessarily
        clean air.
      </p>
    </section>
  );
}
