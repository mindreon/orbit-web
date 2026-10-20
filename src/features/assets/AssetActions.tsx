import { useState } from "react";
import type { Asset } from "../../api/types";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { visibilityLabels } from "../../components/kindLabels";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { DropdownMenu } from "../../ui/DropdownMenu";
import { Field, Select } from "../../ui/fields";
import { describeFailure } from "../../api/errors";
import { assetAction, patchAsset, useAssetMutation } from "./api";
export function AssetActions({ asset }: { asset: Asset }) {
  const [action, setAction] = useState<string | null>(null); const [visibility, setVisibility] = useState(asset.visibility); const write = useAssetMutation(asset.id); const intent = useIdempotencyIntent({ asset: asset.id, action, visibility });
  const complete = () => { intent.succeeded(); setAction(null); };
  return <><DropdownMenu trigger={<Button>更多</Button>} items={[{ label: "修改可见性", onSelect: () => setAction("visibility") }, { label: asset.status === "active" ? "停用" : "恢复", onSelect: () => setAction(asset.status === "active" ? "suspend" : "restore") }, { label: "归档", danger: true, disabled: asset.status === "archived", onSelect: () => setAction("archive") }]} />
    {action === "visibility" ? <Dialog title="修改可见性" onClose={() => setAction(null)}><div className="space-y-4"><Field label="可见性"><Select className="w-full" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>{Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value} disabled={value === "workspace" && !asset.workspace_id}>{label}</option>)}</Select></Field><p className="text-small text-muted-foreground">版本提交后可见性将被冻结。缩小范围会撤销超出范围的共享。</p>{write.error ? <Alert>{describeFailure("修改失败", write.error)}</Alert> : null}<Button variant="primary" disabled={write.isPending} onClick={() => write.mutate(() => patchAsset(asset.id, { visibility }, intent.key), { onSuccess: complete })}>保存</Button></div></Dialog> : action ? <ConfirmDialog name={action === "archive" ? "归档此资产；它将从可用目录中移除" : action === "suspend" ? "停用此资产；不能再用于新的运行" : "恢复此资产，使其重新可用"} busy={write.isPending} onClose={() => setAction(null)} onConfirm={() => write.mutate(() => assetAction(asset.id, action, intent.key), { onSuccess: complete })} /> : null}
  </>;
}
