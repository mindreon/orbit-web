import { Area, Button, Field } from "../ui";
import { useMind } from "../store";
import { cn } from "../lib/cn";

const TABS = [
  ["agent", "智能体"],
  ["skill", "Skill"],
  ["kb", "自建知识库"],
  ["external", "外部知识"],
  ["mcp", "MCP"],
] as const;

export function CapabilitiesPage() {
  const role = useMind((s) => s.role);
  const tab = useMind((s) => s.catalogTab);
  const setTab = useMind((s) => s.setCatalogTab);
  if (role !== "经办人") {
    return <p className="text-muted-foreground p-8 text-sm">合规和财务不能维护能力目录。</p>;
  }

  return (
    <div className="bg-background grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
      <aside className="bg-sidebar border-r border-sidebar-border p-3">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={cn(
              "mb-1 block w-full rounded-md px-3 py-2 text-left text-sm",
              tab === id && "bg-sidebar-accent text-accent-foreground",
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </aside>
      <div className="min-h-0 overflow-auto p-6">
        {tab === "agent" ? <AgentsEditor /> : null}
        {tab === "skill" ? <SkillEditor /> : null}
        {tab === "kb" ? <KbEditor /> : null}
        {tab === "external" ? <ExternalEditor /> : null}
        {tab === "mcp" ? <McpEditor /> : null}
      </div>
    </div>
  );
}

function AgentsEditor() {
  const agents = useMind((s) => s.catalog.agents);
  const updateAgent = useMind((s) => s.updateAgent);
  return (
    <div className="max-w-xl space-y-4">
      {agents.map((agent) => (
        <section key={agent.id} className="rounded-lg border p-3">
          <Field value={agent.name} onChange={(event) => updateAgent(agent.id, { name: event.target.value })} />
          <Area
            className="mt-2"
            rows={3}
            value={agent.duty}
            onChange={(event) => updateAgent(agent.id, { duty: event.target.value })}
          />
        </section>
      ))}
    </div>
  );
}

function SkillEditor() {
  const skills = useMind((s) => s.catalog.skills);
  const selectedId = useMind((s) => s.selectedCatalogId);
  const updateSkill = useMind((s) => s.updateSkill);
  const setTab = useMind((s) => s.setCatalogTab);
  const skill = skills.find((item) => item.id === selectedId) ?? skills[0];
  if (!skill) return null;
  return (
    <div className="grid max-w-4xl grid-cols-[200px_minmax(0,1fr)] gap-4">
      <div>
        {skills.map((item) => (
          <button
            key={item.id}
            className={cn("block w-full rounded-md px-2 py-2 text-left text-sm", item.id === skill.id && "bg-accent")}
            onClick={() => setTab("skill", item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div>
        <Field
          value={skill.name}
          onChange={(event) => updateSkill({ ...skill, name: event.target.value })}
        />
        <ol className="mt-4 space-y-3">
          {skill.steps.map((step, index) => (
            <li key={step.id} className="rounded-lg border p-3">
              <Field
                value={step.name}
                onChange={(event) => {
                  const steps = skill.steps.map((item) =>
                    item.id === step.id ? { ...item, name: event.target.value } : item,
                  );
                  updateSkill({ ...skill, steps });
                }}
              />
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={step.needsConfirm}
                  onChange={(event) => {
                    const steps = skill.steps.map((item) =>
                      item.id === step.id ? { ...item, needsConfirm: event.target.checked } : item,
                    );
                    updateSkill({ ...skill, steps });
                  }}
                />
                这一步要等人确认
              </label>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => {
                    const steps = skill.steps.slice();
                    const [item] = steps.splice(index, 1);
                    steps.splice(index - 1, 0, item);
                    updateSkill({ ...skill, steps });
                  }}
                >
                  上移
                </Button>
                <Button
                  variant="outline"
                  disabled={index === skill.steps.length - 1}
                  onClick={() => {
                    const steps = skill.steps.slice();
                    const [item] = steps.splice(index, 1);
                    steps.splice(index + 1, 0, item);
                    updateSkill({ ...skill, steps });
                  }}
                >
                  下移
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function KbEditor() {
  const bases = useMind((s) => s.catalog.bases);
  const updateBase = useMind((s) => s.updateBase);
  const base = bases[0];
  if (!base) return null;
  return (
    <div className="max-w-xl space-y-4">
      <Field value={base.name} onChange={(event) => updateBase({ ...base, name: event.target.value })} />
      {base.docs.map((doc) => (
        <section key={doc.id} className="rounded-lg border p-3">
          <Field
            value={doc.title}
            onChange={(event) =>
              updateBase({
                ...base,
                docs: base.docs.map((item) => (item.id === doc.id ? { ...item, title: event.target.value } : item)),
              })
            }
          />
          <Area
            className="mt-2"
            rows={4}
            value={doc.body}
            onChange={(event) =>
              updateBase({
                ...base,
                docs: base.docs.map((item) => (item.id === doc.id ? { ...item, body: event.target.value } : item)),
              })
            }
          />
        </section>
      ))}
    </div>
  );
}

function ExternalEditor() {
  const externals = useMind((s) => s.catalog.externals);
  const updateExternal = useMind((s) => s.updateExternal);
  return (
    <div className="max-w-xl space-y-4">
      {externals.map((source) => (
        <section key={source.id} className="rounded-lg border p-3">
          <Field value={source.name} onChange={(event) => updateExternal({ ...source, name: event.target.value })} />
          <Field
            className="mt-2"
            value={source.origin}
            onChange={(event) => updateExternal({ ...source, origin: event.target.value })}
          />
          <Area
            className="mt-2"
            rows={3}
            value={source.excerpt}
            onChange={(event) => updateExternal({ ...source, excerpt: event.target.value })}
          />
        </section>
      ))}
    </div>
  );
}

function McpEditor() {
  const mcps = useMind((s) => s.catalog.mcps);
  const updateMcp = useMind((s) => s.updateMcp);
  return (
    <div className="max-w-xl space-y-4">
      {mcps.map((tool) => (
        <section key={tool.id} className="rounded-lg border p-3">
          <Field value={tool.name} onChange={(event) => updateMcp({ ...tool, name: event.target.value })} />
          <Field
            className="mt-2"
            value={tool.purpose}
            onChange={(event) => updateMcp({ ...tool, purpose: event.target.value })}
          />
          <Button
            className="mt-2"
            variant={tool.connected ? "outline" : "primary"}
            onClick={() => updateMcp({ ...tool, connected: !tool.connected })}
          >
            {tool.connected ? "已连接" : "连接"}
          </Button>
        </section>
      ))}
    </div>
  );
}
