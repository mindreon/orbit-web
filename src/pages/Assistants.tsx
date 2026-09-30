import { Bot, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { describeFailure } from "../lib/api";
import { createPersona, listPersonas, type Persona } from "../lib/catalog";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Textarea } from "../ui/fields";
import { PageBody, PageHeader } from "../ui/PageHeader";
import { Skeleton } from "../ui/Skeleton";

function CreateAssistantDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog title="创建助理" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = name.trim();
          if (!nextName) {
            setError("请填写助理名称");
            return;
          }
          setError("");
          setSaving(true);
          createPersona({ name: nextName, instructions: instructions.trim() })
            .then(() => onCreated())
            .then(onClose)
            .catch((err: unknown) => {
              setError(describeFailure("创建助理失败", err));
              setSaving(false);
            });
        }}
      >
        <div className="space-y-3">
          <Field label="名称">
            <Input aria-label="助理名称" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="说明">
            <Textarea aria-label="助理说明" value={instructions} rows={4} placeholder="这位助理该怎么做事，例如语气、边界、常用做法" onChange={(event) => setInstructions(event.target.value)} />
          </Field>
        </div>
        {error ? <Alert className="mt-3">{error}</Alert> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "正在保存" : "创建助理"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AssistantsPage() {
  const [items, setItems] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function reload() {
    const body = await listPersonas();
    setItems(body.items ?? []);
  }

  useEffect(() => {
    let gone = false;
    listPersonas()
      .then((body) => {
        if (!gone) setItems(body.items ?? []);
      })
      .catch((err: unknown) => {
        if (!gone) setError(describeFailure("读取助理失败", err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" className="h-4 w-4" />
      创建助理
    </Button>
  );
  const empty = !loading && !error && items.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title="助理" description="给任务准备一位助理，名字和说明保存在服务端" actions={empty ? undefined : newButton} />
      {empty ? (
        <div className="flex min-h-0 flex-1 bg-muted">
          <EmptyState icon={Bot} title="还没有助理" description="助理决定任务里的 Agent 怎么做事。先创建一位，再在任务里选用。" actions={newButton} />
        </div>
      ) : (
        <PageBody>
          {error ? <Alert>{error}</Alert> : null}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
          ) : null}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-accent-foreground">{item.name.trim().slice(0, 1) || "助"}</span>
                  <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{item.name}</p>
                </div>
                <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{item.instructions || "没有说明"}</p>
              </li>
            ))}
          </ul>
        </PageBody>
      )}
      {creating ? <CreateAssistantDialog onClose={() => setCreating(false)} onCreated={reload} /> : null}
    </div>
  );
}
