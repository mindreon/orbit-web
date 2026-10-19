import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { ApiError, describeFailure } from "../../../api/errors";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Field, Input } from "../../../ui/fields";
import { Skeleton } from "../../../ui/Skeleton";
import { auth } from "./adapter";
import { useAuth } from "./context";

const DEFAULT_LANDING = "/sessions";

export function LoginPage() {
  const { status, config, error, retry, login, loginDev } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from ?? DEFAULT_LANDING;
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const autoAttempted = useRef(false);
  useEffect(() => {
    if (status !== "anonymous" || config?.mode !== "oidc" || error || autoAttempted.current) return;
    autoAttempted.current = true;
    void auth.autoLogin(from);
  }, [status, config, error, from]);

  if (status === "ready") return <Navigate to={from} replace />;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (cause) {
      setFailure(cause instanceof ApiError || cause instanceof Error ? describeFailure("登录失败", cause) : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  const submitDev = (event: FormEvent) => {
    event.preventDefault();
    void run(() => loginDev({ email: email.trim(), display_name: displayName.trim() || undefined }));
  };

  const shown = failure ?? error;
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm space-y-5 rounded-card bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-heading font-semibold text-foreground">Orbit</h1>
          <p className="mt-1 text-body text-muted-foreground">登录后使用多智能体平台</p>
        </div>
        {shown ? <Alert>{shown}</Alert> : null}
        {status === "loading" ? <Skeleton className="h-24" /> : null}
        {status === "anonymous" && !config ? (
          <Button onClick={retry} className="w-full">
            重试
          </Button>
        ) : null}
        {status === "anonymous" && config?.mode === "oidc" ? (
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => void run(() => login(from))}>
            使用企业账号登录
          </Button>
        ) : null}
        {status === "anonymous" && config?.mode === "dev" ? (
          <form className="space-y-4" onSubmit={submitDev}>
            <Alert tone="warning">开发模式：输入任意邮箱即可登录，首次登录会自动开户。</Alert>
            <Field label="邮箱">
              <Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="显示名（可选）">
              <Input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || email.trim() === ""}>
              登录
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
