import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Sparkles, Users } from "lucide-react";
import type { Asset, S } from "../../api/types";
import { api } from "../../platform/client";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { FileTree } from "../../components/files/FileTree";
import { Markdown } from "../../components/markdown/Markdown";
import { kindLabels, visibilityLabels } from "../../components/kindLabels";
import { assetFile, useAssetList } from "./api";
import { assetTitle } from "../../components/assetText";
import { parseRosterNotes } from "../../lib/teamForm";
import { teamRoleLabels } from "./labels";
import { VersionRefs } from "./VersionDetail";
import { itemsOf, QueryContent } from "./shared";

const CONTENT_TABS = ["概述", "提示词", "配置", "文件", "管理"] as const;

export function ExpertDetail({ asset, management }: { asset: Asset; management: ReactNode }) {
  const versions = useAssetList<S["AssetVersion"]>(asset.id, "versions");
  const items = itemsOf(versions);
  const chosen = items.find((item) => item.state === "published") ?? items[0];
  const tabs = asset.kind === "team" ? ["概述", "成员", "配置", "文件", "管理"] : CONTENT_TABS;
  const [tab, setTab] = useState<(typeof tabs)[number]>("概述");
  const title = assetTitle(asset);
  return (
    <article aria-label={asset.kind === "team" ? "专家团详情" : "专家详情"} className="mx-auto max-w-[1000px]">
      <header className="mb-8">
        <div className="mb-6 flex items-center gap-4 md:gap-6">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-primary-100 text-title font-medium text-primary-700">{title.slice(0, 1)}</span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="min-w-0 text-heading font-semibold leading-7 text-foreground md:text-display md:leading-8">{title}</h1>
            <div className="truncate font-mono text-small leading-5 text-muted-foreground">{asset.publisher}/{asset.name}</div>
            <div className="flex flex-wrap items-center gap-4 text-caption font-medium leading-5 text-foreground">
              <span>{kindLabels[asset.kind]}</span>
              <span className="text-muted-foreground">{visibilityLabels[asset.visibility]}</span>
            </div>
          </div>
        </div>
        {asset.description ? <p className="mb-4 text-body leading-6 text-gray-700 [word-break:break-word]">{asset.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{kindLabels[asset.kind]}</Pill>
          <Pill>{visibilityLabels[asset.visibility]}</Pill>
          {chosen ? <Pill>{chosen.version}</Pill> : null}
        </div>
      </header>
      <div className="relative mb-6 border-b border-border">
        <div className="flex items-center gap-10 overflow-x-auto md:gap-14" role="tablist" aria-label="专家内容">
          {tabs.map((name) => {
            const on = tab === name;
            return (
              <button key={name} type="button" role="tab" aria-selected={on} className={`relative shrink-0 cursor-pointer pb-3 text-title font-medium leading-6 ${on ? "text-foreground" : "text-muted-foreground"}`} onClick={() => setTab(name)}>
                {name}
                {on ? <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-foreground" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {!chosen && !versions.isPending ? <p className="py-16 text-center text-body text-muted-foreground">{asset.kind === "team" ? "这个专家团还没有版本" : "这位专家还没有版本"}</p> : null}
      {chosen && tab !== "管理" ? <Profile asset={asset} versionId={chosen.id} tab={tab} /> : null}
      {tab === "管理" ? <div className="rounded-card bg-card p-4">{management}</div> : null}
    </article>
  );
}

function Profile({ asset, versionId, tab }: { asset: Asset; versionId: string; tab: string }) {
  const { currentTenant } = useIdentity();
  const version = useQuery({ queryKey: qk.assetVersion(currentTenant?.id ?? null, asset.id, versionId), queryFn: ({ signal }) => api.get<S["AssetVersion"]>(`/assets/${asset.id}/versions/${versionId}`, { signal }) });
  const files = useAssetList<S["AssetFile"]>(asset.id, `versions/${versionId}/files`);
  if (version.isPending) return <p className="text-body text-muted-foreground">正在读取</p>;
  if (!version.data) return null;
  const manifest = version.data.manifest;
  if (tab === "概述") return <Overview asset={asset} versionId={versionId} manifest={manifest} />;
  if (tab === "提示词") return <Prompts asset={asset} versionId={versionId} />;
  if (tab === "成员") return <Members assetId={asset.id} versionId={versionId} manifest={manifest} />;
  if (tab === "配置") return <Config manifest={manifest} />;
  return <QueryContent query={files} empty="还没有文件">{itemsOf(files).length ? <FileTree entries={itemsOf(files).map((file) => ({ ...file, size: file.size_bytes }))} onOpen={() => undefined} /> : null}</QueryContent>;
}

function useBundleText(assetId: string, versionId: string, path: string) {
  const { currentTenant } = useIdentity();
  return useQuery({
    queryKey: qk.assetVersion(currentTenant?.id ?? null, assetId, versionId, path),
    queryFn: async ({ signal }) => {
      try {
        return await (await assetFile(assetId, versionId, path, signal)).text();
      } catch {
        return "";
      }
    },
  });
}

function Overview({ asset, versionId, manifest }: { asset: Asset; versionId: string; manifest: S["AssetVersion"]["manifest"] }) {
  const readme = useBundleText(asset.id, versionId, "README.md");
  const text = readme.data?.trim() || manifest.agent?.description || manifest.team?.description || asset.description;
  if (readme.isPending && !text) return <p className="text-body text-muted-foreground">正在读取</p>;
  return text ? <div className="text-body leading-6 text-gray-700"><Markdown text={text} math={false} /></div> : <p className="py-16 text-center text-body text-muted-foreground">{asset.kind === "team" ? "这个专家团没有说明" : "这位专家没有说明文档"}</p>;
}

function Prompts({ asset, versionId }: { asset: Asset; versionId: string }) {
  const agents = useBundleText(asset.id, versionId, "AGENTS.md");
  const soul = useBundleText(asset.id, versionId, "SOUL.md");
  if (agents.isPending || soul.isPending) return <p className="text-body text-muted-foreground">正在读取</p>;
  const blocks = [{ title: "指令（AGENTS.md）", text: agents.data?.trim() }, { title: "人设（SOUL.md）", text: soul.data?.trim() }].filter((block) => block.text);
  if (!blocks.length) return <p className="py-16 text-center text-body text-muted-foreground">这位专家没有提示词</p>;
  return (
    <div className="space-y-6">
      {blocks.map((block) => (
        <section key={block.title}>
          <h3 className="mb-3 text-body font-semibold text-foreground">{block.title}</h3>
          <div className="text-body leading-6 text-gray-700"><Markdown text={block.text ?? ""} math={false} /></div>
        </section>
      ))}
    </div>
  );
}

function Members({ assetId, versionId, manifest }: { assetId: string; versionId: string; manifest: S["AssetVersion"]["manifest"] }) {
  const notes = useBundleText(assetId, versionId, "members.json");
  const roles = manifest.team?.roles ?? [];
  if (!roles.length) return <p className="py-16 text-center text-body text-muted-foreground">这个专家团还没有成员</p>;
  const byName = new Map(parseRosterNotes(notes.data ?? "").map((note) => [note.name, note]));
  const titleOf = (name: string) => byName.get(name)?.label || name;
  const leader = roles.find((member) => member.role === "leader");
  return (
    <section>
      <p className="mb-4 flex items-center gap-3 text-small text-muted-foreground">
        <Users aria-hidden="true" className="h-4 w-4" />
        领队 {leader ? titleOf(leader.name) : "未指定"} · {roles.length} 位成员：{roles.map((member) => titleOf(member.name)).join("、")}
      </p>
      <ul className="space-y-2">
        {roles.map((member) => {
          const note = byName.get(member.name);
          return (
            <li key={member.name} className="rounded-control bg-muted px-4 py-2.5">
              <span className="text-body font-medium text-foreground">{note?.label || member.name}</span>
              <span className="ml-2 text-small text-muted-foreground">{member.role === "leader" ? "领队" : teamRoleLabels[member.role]}</span>
              {note?.label && note.label !== member.name ? <span className="ml-2 font-mono text-caption text-muted-foreground">{member.name}</span> : null}
              {note?.description ? <p className="mt-1 text-small text-gray-700">{note.description}</p> : null}
              <p className="mt-1 font-mono text-small text-muted-foreground">{member.agent}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Config({ manifest }: { manifest: S["AssetVersion"]["manifest"] }) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-foreground"><Sparkles aria-hidden="true" className="h-4 w-4" />技能与 MCP</h3>
        <VersionRefs manifest={manifest} />
      </section>
      {manifest.agent ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-foreground"><Bot aria-hidden="true" className="h-4 w-4" />模型</h3>
          <p className="rounded-control bg-muted px-4 py-2.5 font-mono text-small">{typeof manifest.agent.model === "string" ? manifest.agent.model : manifest.agent.model ? JSON.stringify(manifest.agent.model) : "默认"}</p>
        </section>
      ) : null}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <div className="flex h-5 items-center rounded-full bg-secondary px-2"><span className="whitespace-nowrap text-caption leading-[18px] text-muted-foreground">{children}</span></div>;
}
