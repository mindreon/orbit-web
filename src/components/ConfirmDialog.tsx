import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
export function ConfirmDialog({ name, busy, onConfirm, onClose }: { name: string; busy?: boolean; onConfirm(): void; onClose(): void }) {
  return <Dialog title="确认操作" onClose={onClose}><p className="mb-4 text-body">确定要{name}？</p><div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button variant="danger" disabled={busy} onClick={onConfirm}>确认</Button></div></Dialog>;
}
