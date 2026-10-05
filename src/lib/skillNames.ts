import { useEffect, useState } from "react";
import { getSkill } from "./catalog";

/**
 * 技能 id（`handle/slug` 或裸 `slug`）→ 技能名的解析缓存。
 * 任务配置和专家默认里存的是 id；菜单里现场勾选的名称记在草稿 labels 里，
 * 其余的（比如从已有任务读回的）要查一次目录才知道叫什么。
 * 查过的都记下（含查不到的，记空串避免反复请求），跨组件实例共享。
 */
const cache = new Map<string, string>();

function splitSkillId(id: string): { handle: string; slug: string } {
  const slash = id.indexOf("/");
  if (slash === -1) return { handle: "", slug: id };
  return { handle: id.slice(0, slash), slug: id.slice(slash + 1) };
}

/** 给一批技能 id 补名称。返回值只含已解析到的；没查到的调用方回退显示 id。 */
export function useSkillNames(ids: readonly string[]): Readonly<Record<string, string>> {
  const [, bump] = useState(0);
  const missing = [...new Set(ids.filter((id) => id && !cache.has(id)))];
  const key = missing.join("\n");

  useEffect(() => {
    if (!key) return;
    let gone = false;
    const todo = key.split("\n");
    void Promise.all(
      todo.map(async (id) => {
        const { handle, slug } = splitSkillId(id);
        let name = "";
        try {
          name = (await getSkill(handle, slug)).name ?? "";
        } catch {
          // 查不到（技能下架、目录没同步）就保持空串，徽章回退显示 id。
        }
        cache.set(id, name);
      }),
    ).then(() => {
      if (!gone) bump((value) => value + 1);
    });
    return () => {
      gone = true;
    };
  }, [key]);

  const names: Record<string, string> = {};
  for (const id of ids) {
    const name = cache.get(id);
    if (name) names[id] = name;
  }
  return names;
}
