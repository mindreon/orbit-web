import { useEffect, useState } from "react";
import { describeFailure } from "../lib/api";
import { createPersona, listPersonas, type Persona } from "../lib/catalog";

export function AssistantsPage() {
  const [items, setItems] = useState<Persona[]>([]);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

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

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#f7f7f8] px-6 py-8">
      <h1 className="text-lg font-medium">助理</h1>
      <p className="mt-1 max-w-xl text-sm text-[#666]">给任务准备一位助理。名字和说明会保存在服务端，刷新后还在。</p>
      <form
        className="mt-5 max-w-xl rounded-xl border border-[#ececee] bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = name.trim();
          if (!nextName) {
            setFormError("请填写助理名称");
            return;
          }
          setFormError("");
          setSaving(true);
          setError("");
          createPersona({ name: nextName, instructions: instructions.trim() })
            .then(() => reload())
            .then(() => {
              setName("");
              setInstructions("");
            })
            .catch((err: unknown) => setError(describeFailure("创建助理失败", err)))
            .finally(() => setSaving(false));
        }}
      >
        <label className="block text-sm">
          名称
          <input
            aria-label="助理名称"
            value={name}
            className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-3 text-sm outline-none"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm">
          说明
          <textarea
            aria-label="助理说明"
            value={instructions}
            rows={4}
            className="mt-1 w-full rounded-lg border border-[#e6e6e8] px-3 py-2 text-sm outline-none"
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
        {formError ? <p className="mt-2 text-sm text-[#c04545]">{formError}</p> : null}
        <button type="submit" disabled={saving} className="mt-3 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white disabled:opacity-40">
          {saving ? "正在保存" : "创建助理"}
        </button>
      </form>
      {error ? <p className="mt-4 text-sm text-[#c04545]">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-[#888]">正在加载助理</p> : null}
      {!loading && items.length === 0 ? <p className="mt-4 text-sm text-[#666]">还没有助理。</p> : null}
      <ul className="mt-4 grid max-w-xl gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-[#ececee] bg-white p-4">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="mt-1 text-sm text-[#666]">{item.instructions || "没有说明"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
