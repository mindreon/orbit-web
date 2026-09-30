import { GraduationCap, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { describeFailure } from "../lib/api";
import { createPersona, listPersonas, type Persona } from "../lib/catalog";
import { CatalogHeader } from "../shell/CatalogHeader";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { marketCardClass } from "../ui/card";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Textarea } from "../ui/fields";
import { Skeleton } from "../ui/Skeleton";

function CreateExpertDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <Dialog title="创建专家" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = name.trim();
          if (!nextName) {
            setError("请填写专家名称");
            return;
          }
          setError("");
          setSaving(true);
          createPersona({ name: nextName, instructions: instructions.trim() })
            .then(() => onCreated())
            .then(onClose)
            .catch((err: unknown) => {
              setError(describeFailure("创建专家失败", err));
              setSaving(false);
            });
        }}
      >
        <div className="space-y-3">
          <Field label="名称">
            <Input aria-label="专家名称" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="说明">
            <Textarea aria-label="专家说明" value={instructions} rows={4} placeholder="这位专家该怎么做事，例如语气、边界、常用做法" onChange={(event) => setInstructions(event.target.value)} />
          </Field>
        </div>
        {error ? <Alert className="mt-3">{error}</Alert> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "正在保存" : "创建专家"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** 专家就是智能体：名字加一段说明，保存在服务端。 */
export function ExpertsPage() {
  const [items, setItems] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState("");

  async function reload() {
    const body = await listPersonas();
    setItems(body.items ?? []);
  }

  useEffect(() => {
    let gone = false;
    listPersonas()
      .then((body) => !gone && setItems(body.items ?? []))
      .catch((err: unknown) => !gone && setError(describeFailure("读取专家失败", err)))
      .finally(() => !gone && setLoading(false));
    return () => {
      gone = true;
    };
  }, []);

  const shown = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return needle ? items.filter((item) => `${item.name} ${item.instructions}`.toLowerCase().includes(needle)) : items;
  }, [items, keyword]);

  const create = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" className="h-4 w-4" />
      创建专家
    </Button>
  );
  const empty = !loading && !error && items.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <CatalogHeader title="专家" search={{ value: keyword, onChange: setKeyword, placeholder: "搜索专家名称或说明" }}>
        {empty ? null : create}
      </CatalogHeader>
      {empty ? (
        <div className="flex min-h-0 flex-1">
          <EmptyState icon={GraduationCap} title="还没有专家" description="专家决定任务里的 Agent 怎么做事。先创建一位，写清楚它的角色和做事方式。" actions={create} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-4 text-lg font-semibold text-foreground">我的专家</h2>
            {error ? <Alert>{error}</Alert> : null}
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-[132px]" />
                ))}
              </div>
            ) : null}
            {!loading && shown.length === 0 && items.length > 0 ? <p className="text-sm text-muted-foreground">没有匹配的专家</p> : null}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((item) => (
                <li key={item.id} className={marketCardClass}>
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-foreground">{item.name.trim().slice(0, 1) || "专"}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{item.name}</span>
                  </span>
                  <span className="mt-3 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{item.instructions || "没有说明"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {creating ? <CreateExpertDialog onClose={() => setCreating(false)} onCreated={reload} /> : null}
    </div>
  );
}
