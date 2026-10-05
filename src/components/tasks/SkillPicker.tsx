import { useEffect, useState } from "react";
import { describeFailure } from "../../lib/api";
import { listSkills, type Skill } from "../../lib/catalog";
import { Input } from "../../ui/fields";
import { Option } from "./ConfigOption";

/** 技能目录很大（八万多条），所以按关键词搜索，只显示第一页。选中的由调用方保存。 */
export function SkillPicker({ chosen, onToggle }: { chosen: readonly string[]; onToggle: (skill: Skill) => void }) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<readonly Skill[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    const timer = setTimeout(() => {
      listSkills({ keyword: keyword.trim() })
        .then((body) => !gone && (setResults(body.items ?? []), setError("")))
        .catch((err: unknown) => !gone && setError(describeFailure("读取技能失败", err)));
    }, 250);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [keyword]);

  return (
    <>
      <Input aria-label="搜索技能" value={keyword} placeholder="搜索技能" className="mb-1" onChange={(event) => setKeyword(event.target.value)} />
      {error ? <p className="px-2 py-1 text-small text-danger-700">{error}</p> : null}
      {results.map((skill) => (
        <Option key={skill.id} kind="checkbox" checked={chosen.includes(skill.id)} label={skill.name} id={skill.id} onClick={() => onToggle(skill)} />
      ))}
    </>
  );
}
