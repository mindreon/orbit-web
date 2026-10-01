import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { SkillPicker } from "../components/tasks/SkillPicker";
import { describeFailure } from "../lib/api";
import { listMcpConnectors, type McpConnector } from "../lib/catalog";
import { createExpert, listExperts, updateExpert, type ExpertInput, type UnmatchedRefs } from "../lib/experts";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Field, Input, Textarea } from "../ui/fields";
import { PageHeader } from "../ui/PageHeader";

/** 创建专家，或改一个已有的专家（保存产生新版本，旧版本不变，已经在跑的任务仍用它开始时的版本）。 */
export function ExpertEditorPage() {
  const { expertId } = useParams();
  const navigate = useNavigate();
  const unmatched = (useLocation().state as { unmatched?: UnmatchedRefs } | null)?.unmatched;
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [connectorIds, setConnectorIds] = useState<readonly string[]>([]);
  const [skillIds, setSkillIds] = useState<readonly string[]>([]);
  const [connectors, setConnectors] = useState<readonly McpConnector[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    listMcpConnectors()
      .then((body) => !gone && setConnectors(body.items ?? []))
      .catch(() => undefined);
    if (expertId) {
      listExperts()
        .then((items) => {
          const current = items.find((item) => item.expert_id === expertId);
          if (gone || !current) return;
          setName(current.name);
          setInstructions(current.instructions);
          setModel(current.model);
          setConnectorIds(current.connector_ids);
          setSkillIds(current.skill_ids);
        })
        .catch((err: unknown) => !gone && setError(describeFailure("读取专家失败", err)));
    }
    return () => {
      gone = true;
    };
  }, [expertId]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    const input: ExpertInput = { name: name.trim(), instructions, model: model.trim(), connector_ids: [...connectorIds], skill_ids: [...skillIds] };
    try {
      await (expertId ? updateExpert(expertId, input) : createExpert(input));
      navigate("/experts/agents");
    } catch (err) {
      setError(describeFailure("保存专家失败", err));
      setSaving(false);
    }
  };
  const toggle = (list: readonly string[], set: (next: string[]) => void, id: string) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title={expertId ? "编辑专家" : "创建专家"} back={{ to: "/experts/agents", label: "专家" }} />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <form
          className="mx-auto flex max-w-[720px] flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="名称">
            <Input aria-label="名称" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="指令">
            <Textarea aria-label="指令" rows={6} value={instructions} placeholder="这位专家的做事方式，会加到 Agent 的系统提示词里" onChange={(event) => setInstructions(event.target.value)} />
          </Field>
          <Field label="模型（可选）">
            <Input aria-label="模型" value={model} placeholder="留空使用默认模型" onChange={(event) => setModel(event.target.value)} />
          </Field>
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm text-muted-foreground">默认连接器</legend>
            {connectors.length === 0 ? <p className="text-sm text-muted-foreground">还没有连接器。</p> : null}
            {connectors.map((connector) => (
              <label key={connector.id} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={connectorIds.includes(connector.id)} onChange={() => toggle(connectorIds, setConnectorIds, connector.id)} />
                {connector.name}
              </label>
            ))}
          </fieldset>
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm text-muted-foreground">默认技能（已选 {skillIds.length}）</legend>
            <SkillPicker chosen={skillIds} onToggle={(skill) => toggle(skillIds, setSkillIds, skill.id)} />
          </fieldset>
          {error ? <Alert>{error}</Alert> : null}
          {unmatched && (unmatched.skills.length > 0 || unmatched.connectors.length > 0) ? (
            <Alert>
              目录里的这位专家还用到了你这里没有的：
              {unmatched.skills.length > 0 ? `技能「${unmatched.skills.join("、")}」` : ""}
              {unmatched.connectors.length > 0 ? `连接器「${unmatched.connectors.join("、")}」` : ""}
              。按名字没有对上，可以在下面自己选。
            </Alert>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!name.trim() || saving}>
              保存
            </Button>
            <Button onClick={() => navigate("/experts/agents")}>取消</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
