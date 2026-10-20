import type { Asset } from "../../api/types";
import { useDependents } from "./api";
import { versionStateLabels } from "./labels";
import { itemsOf, MorePages, QueryContent } from "./shared";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Link } from "react-router";
export function DependentsTab({ asset }: { asset: Asset }) {
  const query = useDependents(asset.id); const items = itemsOf(query);
  return <><p className="mb-3 text-small text-muted-foreground">仅列出直接引用此资产的专家。</p><QueryContent query={query} empty="还没有专家使用此资产">{items.length ? <DataTable name="被哪些专家使用" headers={["专家", "引用版本"]}>{items.map((item) => <tr key={item.asset.id}><td><Link className="text-primary-700 hover:underline" to={`/assets/${item.asset.id}`}>{item.asset.display_name || item.asset.name}</Link></td><td><div className="flex flex-wrap gap-1">{item.versions.map((v) => <Link key={v.id} to={`/assets/${item.asset.id}/versions/${v.id}`}><StatusBadge status={v.state}>{v.version}（{versionStateLabels[v.state]}）</StatusBadge></Link>)}</div></td></tr>)}</DataTable> : null}</QueryContent><MorePages query={query} /></>;
}
