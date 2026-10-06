import { Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";
import type { Expert } from "../../lib/experts";
import { TEAM_DESCRIPTION_MAX, TEAM_LABEL_MAX, TEAM_MAX_MEMBERS, TEAM_NAME_MAX, addedRow, type MemberDraft, type TeamForm, type TeamProblems } from "../../lib/team";
import { Button } from "../../ui/Button";
import { Field, Input } from "../../ui/fields";
import { ExpertChooser } from "./ExpertChooser";

interface TeamFieldsProps {
  readonly form: TeamForm;
  readonly onChange: (next: TeamForm) => void;
  /** 能当成员的单人专家（每位的最新版本）。 */
  readonly experts: readonly Expert[];
  /** 提交过一次之后才显示逐项的提示，输入到一半不吓人；之后每次输入都重新检查，改对了提示就消失。 */
  readonly problems: TeamProblems | null;
  /** 从系统预置导入了一位专家（选中预置的那一刻发生），调用方要把它并进自己的专家列表。 */
  readonly onImported: (expert: Expert) => void;
}

/** 专家团的表单：名称、成员（角色名、哪位专家、一句话职责）和领队。后端不接受专家团自己的指令，这些写在成员专家里。 */
export function TeamFields({ form, onChange, experts, problems, onImported }: TeamFieldsProps) {
  const update = (key: string, change: Partial<MemberDraft>) => onChange({ ...form, members: form.members.map((member) => (member.key === key ? { ...member, ...change } : member)) });
  const remove = (key: string) => {
    const members = form.members.filter((member) => member.key !== key);
    onChange({ ...form, members, leader: form.leader === key ? (members[0]?.key ?? "") : form.leader });
  };
  const add = () => {
    const member = addedRow(form);
    onChange({ ...form, members: [...form.members, member], leader: form.leader || member.key });
  };
  return (
    <>
      <Field label="名称" error={problems?.name}>
        <Input aria-label="名称" value={form.name} maxLength={TEAM_NAME_MAX} placeholder="例如：内容小队" onChange={(event) => onChange({ ...form, name: event.target.value })} />
      </Field>
      <fieldset data-testid="team-members">
        <legend className="mb-1 p-0 text-small font-medium text-gray-700">
          成员（{form.members.length}/{TEAM_MAX_MEMBERS}）
        </legend>
        <p className="mb-2 text-small text-muted-foreground">领队负责规划，成员按分工执行。每位成员由一位单人专家担任（自己的或目录里预置的）；选一位成员当领队。</p>
        {experts.length === 0 ? (
          <p className="mb-2 text-body text-muted-foreground">
            还没有自己的单人专家。可以直接在成员的「担任的专家」里选一位系统预置的，或
            <Link to="/experts/new" className="ml-1 text-primary-700 hover:underline">
              先创建单人专家
            </Link>
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {form.members.map((member, index) => {
            const row = problems?.rows[member.key];
            const n = index + 1;
            return (
              <li key={member.key} data-testid="team-member-row" data-leader={form.leader === member.key ? "true" : undefined} className="rounded-card bg-muted p-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-body text-gray-700">
                    <input type="radio" name="team-leader" aria-label={`第 ${n} 位成员当领队`} checked={form.leader === member.key} onChange={() => onChange({ ...form, leader: member.key })} />
                    领队
                  </label>
                  <span className="text-small text-muted-foreground">第 {n} 位</span>
                  <Button variant="ghost" size="sm" className="ml-auto" aria-label={`移除第 ${n} 位成员`} disabled={form.members.length <= 1} onClick={() => remove(member.key)}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    移除
                  </Button>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field label="显示名" error={row?.label}>
                    <Input aria-label={`显示名 ${n}`} value={member.label} maxLength={TEAM_LABEL_MAX + 10} placeholder="例如 研究员" onChange={(event) => update(member.key, { label: event.target.value })} />
                  </Field>
                  <Field label="担任的专家" error={row?.expert}>
                    <ExpertChooser ariaLabel={`专家 ${n}`} value={member.expert} experts={experts} onSelect={(ref) => update(member.key, { expert: ref })} onImported={onImported} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="一句话职责" error={row?.description}>
                    <Input aria-label={`职责 ${n}`} value={member.description} maxLength={TEAM_DESCRIPTION_MAX + 50} placeholder="领队会按这句话把活派给它" onChange={(event) => update(member.key, { description: event.target.value })} />
                  </Field>
                </div>
                {/* 角色 ID 是给程序用的，自动生成；出了问题（或想自己起名）时才需要看。有错时展开，让人看得到错在哪。 */}
                <details open={row?.role ? true : undefined} className="mt-3" data-testid="team-member-advanced">
                  <summary className="cursor-pointer text-small font-medium text-gray-700">高级</summary>
                  <div className="mt-2">
                    <Field label="角色 ID" error={row?.role}>
                      <Input aria-label={`角色 ID ${n}`} value={member.role} maxLength={40} placeholder="member-1" onChange={(event) => update(member.key, { role: event.target.value })} />
                    </Field>
                    <p className="mt-1 text-caption text-muted-foreground">小写字母开头，只含小写字母、数字、- 和 _；每位成员不同。自动生成，一般不用改。</p>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        {problems?.members ? <p className="mt-2 text-small text-danger-700">{problems.members}</p> : null}
        {problems?.leader ? <p className="mt-2 text-small text-danger-700">{problems.leader}</p> : null}
        <Button className="mt-3" size="sm" disabled={form.members.length >= TEAM_MAX_MEMBERS} onClick={add}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          添加成员
        </Button>
      </fieldset>
    </>
  );
}
