import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { describeFailure } from "../../api/errors";
import type { AssetKind, S } from "../../api/types";
import { useIdentity } from "../../platform/identity";
import { useWorkspace } from "../../platform/tenancy/WorkspaceProvider";
import { qk } from "../../platform/queryKeys";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { Button } from "../../ui/Button";
import { Field, Input, Select } from "../../ui/fields";
import { Alert } from "../../ui/Alert";
import { toast } from "../../platform/toast/store";
import { PageBody, PageHeader } from "../../ui/PageHeader";
import { kindLabels } from "../../components/kindLabels";
import { assetNameValid } from "./model";
import { createAsset } from "./api";
const kinds: { kind: AssetKind; note: string }[] = [{ kind: "agent", note: "可独立开始对话" }, { kind: "team", note: "由多位专家协作" }, { kind: "skill", note: "供专家复用的技能" }, { kind: "mcp_server", note: "可复用的 MCP 服务" }];
export default function NewAsset() {
  const navigate = useNavigate(); const cache = useQueryClient(); const { currentTenant } = useIdentity(); const { workspaces, current } = useWorkspace();
  const [kind, setKind] = useState<AssetKind>("agent"); const [name, setName] = useState(""); const [visibility, setVisibility] = useState<S["AssetInput"]["visibility"]>("private"); const [workspace, setWorkspace] = useState(current?.id ?? ""); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const body: S["AssetInput"] = { kind, name, visibility, ...(visibility === "workspace" ? { workspace_id: workspace } : {}) }; const intent = useIdempotencyIntent(body); const valid = assetNameValid(name) && (visibility !== "workspace" || Boolean(workspace));
  return <><PageHeader title="新建资产" back={{ to: "/assets/mine", label: "我的" }} /><PageBody narrow><form className="max-w-reading space-y-6" onSubmit={(event) => { event.preventDefault(); if (!valid || busy) return; setBusy(true); setError(undefined); void createAsset(body, intent.key).then(async (asset) => { intent.succeeded(); await cache.invalidateQueries({ queryKey: qk.assetLists(currentTenant?.id ?? null) }); navigate(`/assets/${asset.id}`, { state: { created: true } }); }, (failure) => { setError(failure); toast.error(describeFailure("创建资产失败", failure)); }).finally(() => setBusy(false)); }}>
    <section className="space-y-3"><h2 className="text-small font-medium text-muted-foreground">类型</h2><div className="grid grid-cols-2 gap-3">{kinds.map((item) => <label key={item.kind} className={`cursor-pointer rounded-card border p-4 ${kind === item.kind ? "border-primary-500 bg-primary-50" : "border-border bg-card"}`}><span className="flex items-center gap-2 font-medium"><input type="radio" name="kind" value={item.kind} checked={kind === item.kind} onChange={() => setKind(item.kind)} />{kindLabels[item.kind]}</span><span className="mt-1 block pl-6 text-small text-muted-foreground">{item.note}</span></label>)}</div></section>
    <Field label="名称"><Input value={name} maxLength={64} autoComplete="off" aria-invalid={Boolean(name) && !assetNameValid(name)} onChange={(event) => setName(event.target.value)} /></Field><p className="-mt-5 text-caption text-muted-foreground">小写字母、数字、连字符，3–64 位</p>{name && !assetNameValid(name) ? <p className="-mt-5 text-small text-danger-700">名称格式不正确</p> : null}
    <fieldset><legend className="mb-2 text-small font-medium">可见性</legend><div className="flex flex-wrap gap-4">{([["private", "私有"], ["workspace", "工作空间"], ["tenant", "全员可见"]] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2 text-small"><input type="radio" name="visibility" checked={visibility === value} onChange={() => setVisibility(value)} />{label}</label>)}</div></fieldset>
    {visibility === "workspace" ? <Field label="工作空间"><Select className="w-full" value={workspace} onChange={(event) => setWorkspace(event.target.value)}><option value="">选择工作空间</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field> : null}
    {error ? <Alert>{describeFailure("创建资产失败", error)}</Alert> : null}<div className="flex justify-end gap-2"><Button onClick={() => navigate("/assets/mine")}>取消</Button><Button type="submit" variant="primary" disabled={!valid || busy}>创建资产</Button></div>
  </form></PageBody></>;
}
