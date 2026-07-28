export default function WhyThisMatters() {
  return (
    <section className="rounded-lg border border-rail-line bg-rail-panel p-6">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-signal-clear">Why this matters</p>
      <h2 className="mb-3 text-base font-semibold text-text-primary">Air quality is the everyday, invisible version of infrastructure risk</h2>

      <div className="space-y-3 text-sm leading-relaxed text-text-muted">
        <p>
          Everyday viewers: the number on this screen roughly tracks how much fine particulate matter and gas
          you're breathing where you live, compared with the World Health Organization's 2021 guideline levels —
          the thresholds below which long-term health risk is considered low.
        </p>
        <p>
          Builders: this page is a template for turning a public sensor network into a scored, comparable metric.
          The exposure formula lives in one file (<code className="rounded bg-rail-void px-1 py-0.5 font-mono text-xs text-signal-clear">lib/exposure.ts</code>) so you can
          replace the WHO-ratio model with your own — a validated health-impact function, a regulatory threshold,
          or a cost curve — without touching the map, chart, or API routes.
        </p>
        <p>
          Allocators: exposure scoring only becomes decision-useful when it's weighted by population, not just
          concentration. A high reading over an empty industrial zone and the same reading over a dense
          residential district are different problems. That's why this rail joins OpenAQ (what's in the air) with
          WorldPop (who's there to breathe it) before producing a single score.
        </p>
      </div>

      <div className="mt-4 rounded-md border border-rail-line-bright/60 bg-rail-void p-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-faint">Exposure score formula</p>
        <p className="mt-1 font-mono text-xs text-text-muted">
          ratio = mean_concentration / WHO_guideline<br />
          score = 100 × (1 − 1 / (1 + max(ratio − 1, 0)))<br />
          category = Low / Moderate / High / Severe by score band
        </p>
      </div>
    </section>
  );
}
