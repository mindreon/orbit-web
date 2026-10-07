import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ConnectorChooser } from "../components/experts/ConnectorChooser";
import { SkillChooser } from "../components/experts/SkillChooser";
import { ExpertFiles } from "../components/experts/ExpertFiles";
import { TeamFields } from "../components/experts/TeamFields";
import { describeFailure } from "../lib/api";
import { listMcpConnectors, type McpConnector } from "../lib/catalog";
import { createExpert, isTeam, listExperts, singleExperts, updateExpert, type Expert, type ExpertInput, type McpUnbound, type SkippedFile, type UnmatchedRefs } from "../lib/experts";
import { TEAM_DESCRIPTION_MAX, blankTeamForm, hasProblems, teamInput, teamProblemsFromRefusal, teamToForm, validateTeam, type TeamForm, type TeamProblems } from "../lib/team";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Field, Input, Textarea } from "../ui/fields";
import { PageHeader } from "../ui/PageHeader";
import { SegmentedTabs } from "../ui/Tabs";

type Kind = "expert" | "team";
const KINDS = [
  { id: "expert", label: "单人专家" },
  { id: "team", label: "专家团" },
] as const;

/** 创建专家，或改一个已有的专家（保存产生新版本，旧版本不变，已经在跑的任务仍用它开始时的版本）。 */
export function ExpertEditorPage() {
  const { expertId } = useParams();
  const navigate = useNavigate();
  const imported = (useLocation().state as { unmatched?: UnmatchedRefs; skippedFiles?: SkippedFile[] } | null) ?? null;
  const unmatched = imported?.unmatched;
  const skippedFiles = imported?.skippedFiles ?? [];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [soul, setSoul] = useState("");
  const [mcpUnbound, setMcpUnbound] = useState<readonly McpUnbound[]>([]);
  const [model, setModel] = useState("");
  const [connectorIds, setConnectorIds] = useState<readonly string[]>([]);
  const [skillIds, setSkillIds] = useState<readonly string[]>([]);
  const [skillLabels, setSkillLabels] = useState<Readonly<Record<string, string>>>({});
  const [connectors, setConnectors] = useState<readonly McpConnector[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<Kind>("expert");
  const [experts, setExperts] = useState<readonly Expert[]>([]);
  const [team, setTeam] = useState<TeamForm>(blankTeamForm);
  // Once a save was tried the form is checked after every change, so a fixed field stops being flagged at once; control's own
  // refusal of a save stays until the next change.
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<TeamProblems | null>(null);

  useEffect(() => {
    let gone = false;
    listMcpConnectors()
      .then((body) => !gone && setConnectors(body.items ?? []))
      .catch(() => undefined);
    listExperts()
      .then((items) => {
        if (gone) return;
        setExperts(items);
        const current = expertId ? items.find((item) => item.expert_id === expertId) : undefined;
        if (!current) return;
        if (isTeam(current)) {
          setKind("team");
          setTeam(teamToForm(current));
          return;
        }
        setName(current.name);
        setDescription(current.description ?? "");
        setInstructions(current.instructions);
        setSoul(current.soul ?? "");
        setMcpUnbound(current.mcp_unbound ?? []);
        setModel(current.model);
        setConnectorIds(current.connector_ids);
        setSkillIds(current.skill_ids);
      })
      .catch((err: unknown) => !gone && expertId && setError(describeFailure("读取专家失败", err)));
    return () => {
      gone = true;
    };
  }, [expertId]);

  const known = useMemo(() => singleExperts(experts), [experts]);
  const found = useMemo(() => (tried ? validateTeam(team, known) : null), [tried, team, known]);
  const problems = found && hasProblems(found) ? found : refused;
  const editTeam = (next: TeamForm) => {
    setTeam(next);
    setRefused(null);
    setError("");
  };
  const handleLabels = useCallback((records: Readonly<Record<string, string>>) => setSkillLabels((prev) => ({ ...prev, ...records })), []);
  // 从系统预置导入的成员专家并进列表：校验认得它，下拉里也出现在「我的专家」。
  const importExpert = (expert: Expert) => setExperts((prev) => (prev.some((item) => item.expert_id === expert.expert_id) ? prev : [...prev, expert]));

  const save = async () => {
    if (saving) return;
    if (kind === "team") {
      setTried(true);
      if (hasProblems(validateTeam(team, known))) {
        setError("");
        return;
      }
      setSaving(true);
      setError("");
      try {
        const input: ExpertInput = teamInput(team);
        await (expertId ? updateExpert(expertId, input) : createExpert(input));
        navigate("/experts/agents");
      } catch (err) {
        // Control names the part at fault (`members[2].expert`): the message goes under that field.
        const refusal = teamProblemsFromRefusal(err, team);
        setRefused(refusal?.problems ?? null);
        setError(refusal ? (refusal.general ? `保存专家团失败：${refusal.general}` : "保存专家团失败：请看下面标出的地方。") : describeFailure("保存专家团失败", err));
        setSaving(false);
      }
      return;
    }
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const input: ExpertInput = { name: name.trim(), description: description.trim(), instructions, soul, model: model.trim(), connector_ids: [...connectorIds], skill_ids: [...skillIds] };
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
      <PageHeader title={expertId ? (kind === "team" ? "编辑专家团" : "编辑专家") : "创建专家"} back={{ to: "/experts/agents", label: "专家" }} />
      <div className="min-h-0 flex-1 overflow-auto bg-muted px-4 py-5 sm:px-6">
        <form
          className="mx-auto flex max-w-[720px] flex-col gap-5 rounded-card bg-card p-4 shadow-sm sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {expertId ? null : (
            <div>
              <p className="mb-1 text-small font-medium text-gray-700">类型</p>
              <SegmentedTabs label="专家类型" value={kind} options={KINDS} onChange={(next) => { setKind(next); setError(""); }} />
              <p className="mt-1 text-small text-muted-foreground">{kind === "team" ? "专家团由一位领队和若干成员组成：领队负责规划，成员按分工执行。" : "单人专家有自己的指令、模型、技能和连接器。"}</p>
            </div>
          )}
          {kind === "team" ? (
            <TeamFields form={team} onChange={editTeam} experts={singleExperts(experts)} problems={problems} onImported={importExpert} />
          ) : (
            <>
            <Field label="名称">
              <Input aria-label="名称" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="职能（一句话）">
              <Textarea aria-label="职能" rows={2} maxLength={TEAM_DESCRIPTION_MAX} value={description} placeholder="例如：React/TypeScript 前端开发，负责页面和组件" onChange={(event) => setDescription(event.target.value)} />
              <span className="mt-1 block text-small text-muted-foreground">写给领队看：它按这句话决定把活派给谁。拉进专家团时，成员不写职责就用这一句。</span>
            </Field>
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
            <fieldset>
              <legend className="mb-1 p-0 text-small font-medium text-gray-700">默认连接器（已选 {connectorIds.length}）</legend>
              <ConnectorChooser chosen={connectorIds} connectors={connectors} onToggle={(id) => toggle(connectorIds, setConnectorIds, id)} />
              {mcpUnbound.length > 0 ? (
                <div className="mt-2">
                  <Alert tone="warning">
                    需要配置的连接器：
                    {mcpUnbound.map((item) => `${item.name}（${item.reason}）`).join("、")}
                  </Alert>
                </div>
              ) : null}
            </fieldset>
            <fieldset>
              <legend className="mb-1 p-0 text-small font-medium text-gray-700">默认技能（已选 {skillIds.length}）</legend>
              <SkillChooser
                chosen={skillIds}
                labels={skillLabels}
                onLabels={handleLabels}
                onToggle={(skill) => toggle(skillIds, setSkillIds, skill.id)}
                onRemove={(id) => toggle(skillIds, setSkillIds, id)}
              />
            </fieldset>
            {/* Wait for the list: until it answers `kind` is still "expert", and a team has no bundle files to fetch. */}
            {expertId && experts.some((item) => item.expert_id === expertId && !isTeam(item)) ? <ExpertFiles expertId={expertId} /> : null}
            </>
          )}
          {error ? <Alert>{error}</Alert> : null}
          {kind === "expert" && unmatched && (unmatched.skills.length > 0 || unmatched.connectors.length > 0) ? (
            <Alert>
              目录里的这位专家还用到了你这里没有的：
              {unmatched.skills.length > 0 ? `技能「${unmatched.skills.join("、")}」` : ""}
              {unmatched.connectors.length > 0 ? `连接器「${unmatched.connectors.join("、")}」` : ""}
              。按名字没有对上，可以在下面自己选。
            </Alert>
          ) : null}
          {kind === "expert" && skippedFiles.length > 0 ? (
            <Alert tone="warning">
              有 {skippedFiles.length} 个文件没有导入：{skippedFiles.map((file) => `${file.path}（${file.reason}）`).join("、")}。
            </Alert>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={saving || (kind === "expert" && !name.trim())}>
              保存
            </Button>
            <Button onClick={() => navigate("/experts/agents")}>取消</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
