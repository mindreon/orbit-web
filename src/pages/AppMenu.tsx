import { useSyncExternalStore } from "react";
import { getPublishedApps, subscribePublishedApps, type PublishedApp } from "../lib/publishedApps";

export function AppMenu({ matterId, onPick }: { matterId: string | null; onPick: (app: PublishedApp) => void }) {
  const apps = useSyncExternalStore(subscribePublishedApps, getPublishedApps, getPublishedApps);
  if (apps.length === 0) return <p className="px-3 py-2 text-xs text-[#888]">当前暂无可选应用</p>;
  const current = matterId ? apps.filter((item) => item.matterId === matterId) : [];
  const others = matterId ? apps.filter((item) => item.matterId !== matterId) : apps;
  return (
    <div className="border-t border-[#f0f0f1] px-1 py-1 text-xs">
      {matterId ? <AppGroup title="本任务" apps={current} onPick={onPick} /> : null}
      <AppGroup title="本工作区其他任务" apps={others} onPick={onPick} />
    </div>
  );
}

function AppGroup({ title, apps, onPick }: { title: string; apps: PublishedApp[]; onPick: (app: PublishedApp) => void }) {
  return (
    <div className="py-1">
      <p className="px-2 py-1 text-[#999]">{title}</p>
      {apps.length === 0 ? <p className="px-2 py-1 text-[#888]">当前暂无可选应用</p> : null}
      {apps.map((app) => (
        <button key={app.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f6f6f7]" onClick={() => onPick(app)}>
          <span className="min-w-0 flex-1 truncate">{app.name}</span>
          <span className="text-[#888]">{app.status}</span>
        </button>
      ))}
    </div>
  );
}
