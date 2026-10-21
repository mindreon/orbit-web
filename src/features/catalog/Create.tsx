import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { describeFailure } from "../../api/errors";
import type { Asset, S } from "../../api/types";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { gzipTar } from "../../lib/tar";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field, Input, Select, Textarea } from "../../ui/fields";
import { PageHeader } from "../../ui/PageHeader";
import { useCatalog } from "./api";

type Kind = "agent" | "team";

/** 中文名称不能当资产标识，所以另生成一个小写标识。目录导入的标识以 cat- 开头，这里避开它。 */
function slugFor(display: string) {
  const ascii = display.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (/^[a-z0-9][a-z0-9-]{2,63}$/.test(ascii) && !ascii.startsWith("cat-")) return ascii.slice(0, 64);
  let hash = 0;
  for (const char of display) hash = (Math.imul(hash, 33) + char.codePointAt(0)!) >>> 0;
  return `ex-${hash.toString(16).padStart(8, "0")}`;
}

function agentRef(asset: Asset) {
  return `${asset.publisher}/${asset.name}@^1.0.0`;
}

export default function CreateExpert() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { currentTenant } = useIdentity();
  const initial: Kind = search.get("kind") === "team" ? "team" : "agent";
  const [kind, setKind] = useState<Kind>(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [soul, setSoul] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [leader, setLeader] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const agents = useCatalog("agent");
  const choices = agents.data?.items.map((item) => item.asset) ?? [];
  const keys = useRef<{ fingerprint: string; create: string; version: string; submit: string } | null>(null);

  const save = async () => {
    if (busy || !name.trim()) return;
    if (kind === "team" && !leader) {
      setError(new Error("请选择领队"));
      return;
    }
    const display = name.trim();
    const slug = slugFor(display);
    const fingerprint = JSON.stringify({ kind, slug, display, description, soul, instructions, model, leader, members });
    if (!keys.current || keys.current.fingerprint !== fingerprint) {
      keys.current = { fingerprint, create: crypto.randomUUID(), version: crypto.randomUUID(), submit: crypto.randomUUID() };
    }
    setBusy(true);
    setError(undefined);
    try {
      const asset = await api.post<Asset>("/assets", { kind, name: slug, visibility: "private" }, { idempotencyKey: keys.current.create });
      const files = kind === "team" ? teamFiles(slug, display, description, leader, members, choices) : expertFiles(slug, display, description, soul, instructions, model);
      const archive = await gzipTar(files);
      const version = await api.postBinary<S["AssetVersion"]>(`/assets/${asset.id}/versions`, archive, { query: { version: "1.0.0" }, idempotencyKey: keys.current.version });
      await api.post(`/assets/${asset.id}/versions/${version.id}:submit`, { channel: "stable" }, { idempotencyKey: keys.current.submit });
      keys.current = null;
      await cache.invalidateQueries({ queryKey: qk.assetLists(currentTenant?.id ?? null) });
      navigate(`/assets/${asset.id}`);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title={kind === "team" ? "创建专家团" : "创建专家"} back={{ to: kind === "team" ? "/expert-teams" : "/experts", label: kind === "team" ? "专家团" : "专家" }} />
      <div className="min-h-0 flex-1 overflow-auto bg-muted px-4 py-5 sm:px-6">
        <form className="mx-auto flex max-w-[720px] flex-col gap-5 rounded-card bg-card p-4 shadow-sm sm:p-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div>
            <p className="mb-1 text-small font-medium text-gray-700">类型</p>
            <div className="flex gap-2" role="tablist" aria-label="专家类型">
              {([["agent", "单人专家"], ["team", "专家团"]] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={kind === id} className={`rounded-control px-3 py-1.5 text-small ${kind === id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`} onClick={() => { setKind(id); setError(undefined); }}>{label}</button>
              ))}
            </div>
            <p className="mt-1 text-small text-muted-foreground">{kind === "team" ? "专家团由一位领队和若干成员组成：领队负责规划，成员按分工执行。" : "单人专家有自己的指令、模型、技能和连接器。"}</p>
          </div>
          <Field label="名称"><Input aria-label="名称" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="职能（一句话）">
            <Textarea aria-label="职能" rows={2} maxLength={500} value={description} placeholder="例如：React/TypeScript 前端开发，负责页面和组件" onChange={(event) => setDescription(event.target.value)} />
            <span className="mt-1 block text-small text-muted-foreground">写给领队看：它按这句话决定把活派给谁。</span>
          </Field>
          {kind === "agent" ? (
            <>
              <Field label="人设（SOUL.md）">
                <Textarea aria-label="人设" rows={4} value={soul} placeholder="例如：沉稳、爱用比喻，先给结论再解释" onChange={(event) => setSoul(event.target.value)} />
                <span className="mt-1 block text-small text-muted-foreground">这位专家的人设和语气，会在指令之前加载。</span>
              </Field>
              <Field label="指令（AGENTS.md）">
                <Textarea aria-label="指令" rows={6} value={instructions} placeholder="这位专家的做事方式，会加到 Agent 的系统提示词里" onChange={(event) => setInstructions(event.target.value)} />
              </Field>
              <Field label="模型（可选）">
                <Input aria-label="模型" value={model} placeholder="留空使用默认模型" onChange={(event) => setModel(event.target.value)} />
              </Field>
            </>
          ) : (
            <TeamFields choices={choices} leader={leader} members={members} onLeader={setLeader} onMembers={setMembers} />
          )}
          {error ? <Alert>{describeFailure(kind === "team" ? "保存专家团失败" : "保存专家失败", error)}</Alert> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{busy ? "保存中" : "保存"}</Button>
            <Button onClick={() => navigate(kind === "team" ? "/expert-teams" : "/experts")}>取消</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamFields({ choices, leader, members, onLeader, onMembers }: { choices: Asset[]; leader: string; members: string[]; onLeader(id: string): void; onMembers(ids: string[]): void }) {
  if (!choices.length) return <p className="text-small text-muted-foreground">还没有可选的专家。先创建一位单人专家，再来组专家团。</p>;
  return (
    <>
      <Field label="领队">
        <Select aria-label="领队" className="w-full" value={leader} onChange={(event) => onLeader(event.target.value)}>
          <option value="">选择领队</option>
          {choices.map((asset) => <option key={asset.id} value={asset.id}>{asset.display_name || asset.name}</option>)}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1 text-small font-medium text-gray-700">成员</legend>
        <ul className="space-y-2">
          {choices.filter((asset) => asset.id !== leader).map((asset) => (
            <li key={asset.id}>
              <label className="flex items-center gap-2 text-small">
                <input type="checkbox" checked={members.includes(asset.id)} onChange={() => onMembers(members.includes(asset.id) ? members.filter((id) => id !== asset.id) : [...members, asset.id])} />
                {asset.display_name || asset.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  );
}

function expertFiles(slug: string, display: string, description: string, soul: string, instructions: string, model: string): Record<string, string> {
  const manifest: Record<string, unknown> = { schema: "orbit.agent/v2", name: slug, displayName: { zh: display } };
  if (description.trim()) manifest.description = description.trim();
  if (model.trim()) manifest.model = model.trim();
  return {
    "agent.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "AGENTS.md": instructions.trim() || description.trim() || `${display}按照用户的目标完成任务。`,
    ...(soul.trim() ? { "SOUL.md": soul.trim() } : {}),
    ...(description.trim() ? { "README.md": `# ${display}\n\n${description.trim()}\n` } : {}),
  };
}

function teamFiles(slug: string, display: string, description: string, leader: string, members: string[], choices: Asset[]): Record<string, string> {
  const byId = new Map(choices.map((asset) => [asset.id, asset]));
  const lead = byId.get(leader);
  const roles = [
    ...(lead ? [{ name: "leader", role: "leader", agent: agentRef(lead) }] : []),
    ...members.flatMap((id, index) => {
      const asset = byId.get(id);
      return asset ? [{ name: `member-${index + 1}`, role: "teammate", agent: agentRef(asset) }] : [];
    }),
  ];
  const manifest = { schema: "orbit.team/v1", name: slug, description: description.trim() ? `${display}\n${description.trim()}` : display, roles, dispatch: "scheduled" };
  return {
    "team.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "AGENTS.md": description.trim() || `${display}由领队规划，成员按分工执行。`,
  };
}
