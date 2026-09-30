import { useState } from "react";
import { describeFailure } from "../../lib/api";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field, Input, Textarea } from "../../ui/fields";

interface NewTaskDialogProps {
  readonly onClose: () => void;
  readonly onCreate: (input: { title: string; goal: string }) => Promise<void>;
}

export function NewTaskDialog({ onClose, onCreate }: NewTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim() || !goal.trim()) {
      setError("标题和目标都要填写");
      return;
    }
    setSaving(true);
    try {
      await onCreate({ title: title.trim(), goal: goal.trim() });
      onClose();
    } catch (err) {
      setError(describeFailure("创建任务失败", err));
      setSaving(false);
    }
  };

  return (
    <Dialog title="新建任务" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-3">
          <Field label="任务标题">
            <Input value={title} autoFocus placeholder="任务标题" onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="任务目标">
            <Textarea value={goal} rows={4} placeholder="任务目标" onChange={(e) => setGoal(e.target.value)} />
          </Field>
        </div>
        {error ? <Alert className="mt-3">{error}</Alert> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "正在创建" : "创建任务"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
