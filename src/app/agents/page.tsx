export default function AgentsPage() {
  return (
    <section aria-labelledby="agents-title" className="flex flex-col gap-10">
      <h1 id="agents-title" className="text-xl font-semibold">
        Agents
      </h1>

      {/* Personas stay in their own region. Do not mix Cloud Job into this grid. */}
      <div aria-labelledby="personas-title">
        <h2 id="personas-title" className="mb-3 text-sm font-medium text-foreground">
          Personas
        </h2>
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          Persona 与 Skill 目录尚未接通。后续由 control 管理版本，再交给 AgentScope
          会话。
        </div>
      </div>

      {/* Cloud is a separate type, not a persona card. */}
      <div aria-labelledby="cloud-title">
        <h2 id="cloud-title" className="mb-3 text-sm font-medium text-foreground">
          Cloud
        </h2>
        <article
          aria-label="Cloud Job, disabled until W2"
          className="w-72 cursor-not-allowed rounded-md border border-border bg-surface-muted p-4 text-muted-foreground opacity-70"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-body">Cloud Job</p>
            <span className="shrink-0 text-xs text-muted-foreground">「W2」</span>
          </div>
          <p className="mt-2 text-xs">等待 clone / run / push / PR 执行链与隔离环境。</p>
        </article>
      </div>
    </section>
  );
}
