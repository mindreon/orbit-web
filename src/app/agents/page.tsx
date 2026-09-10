export default function AgentsPage() {
  return (
    <section aria-labelledby="agents-title" className="flex flex-col gap-10">
      <h1 id="agents-title" className="text-xl font-semibold">
        Agents
      </h1>

      {/* Personas stay in their own region. Do not mix Cloud Job into this grid. */}
      <div aria-labelledby="personas-title">
        <h2 id="personas-title" className="mb-3 text-sm font-medium text-zinc-700">
          Personas
        </h2>
        <div className="rounded-md border border-dashed border-zinc-300 px-4 py-8 text-sm text-zinc-500">
          Empty. No persona cards in W0.
        </div>
      </div>

      {/* Cloud is a separate type, not a persona card. */}
      <div aria-labelledby="cloud-title">
        <h2 id="cloud-title" className="mb-3 text-sm font-medium text-zinc-700">
          Cloud
        </h2>
        <article
          aria-label="Cloud Job, disabled until W2"
          className="w-72 cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-200/80 p-4 text-zinc-500 opacity-70"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-zinc-600">Cloud Job</p>
            <span className="shrink-0 text-xs text-zinc-500">「W2」</span>
          </div>
          <p className="mt-2 text-xs">Disabled placeholder. Not clickable.</p>
        </article>
      </div>
    </section>
  );
}
