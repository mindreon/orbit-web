import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, describeFailure } from "./api";
import { DEFAULT_CUSTOM, isPreset, type CustomPermissions, type PermissionPreset } from "./permissions";

/** 你的设置：新任务的默认权限，以及「自定义」预设的规则。 */
export type Settings = {
  permissions: {
    default_preset: PermissionPreset;
    custom: CustomPermissions;
  };
};

export const DEFAULT_SETTINGS: Settings = { permissions: { default_preset: "default", custom: DEFAULT_CUSTOM } };

/** 后端的回答补齐成完整的设置：缺的、不认识的都退回默认（旧版本或没存过设置时回答里没有 permissions）。 */
export function readSettings(body: unknown): Settings {
  const permissions = (body as { permissions?: { default_preset?: unknown; custom?: Partial<Record<keyof CustomPermissions, unknown>> } } | null)?.permissions;
  const custom = permissions?.custom ?? {};
  return {
    permissions: {
      default_preset: isPreset(permissions?.default_preset) ? permissions.default_preset : DEFAULT_SETTINGS.permissions.default_preset,
      custom: {
        write_scope: custom.write_scope === "none" || custom.write_scope === "workspace" ? custom.write_scope : DEFAULT_CUSTOM.write_scope,
        auto_edits: typeof custom.auto_edits === "boolean" ? custom.auto_edits : DEFAULT_CUSTOM.auto_edits,
        auto_commands: typeof custom.auto_commands === "boolean" ? custom.auto_commands : DEFAULT_CUSTOM.auto_commands,
        auto_builtin: typeof custom.auto_builtin === "boolean" ? custom.auto_builtin : DEFAULT_CUSTOM.auto_builtin,
      },
    },
  };
}

export const getSettings = () => api<unknown>("/v1/settings").then(readSettings);
export const putSettings = (settings: Settings) => api<unknown>("/v1/settings", { method: "PUT", body: JSON.stringify(settings) }).then(readSettings);

/** 修改停下这么久才保存，连续点几下只发一次。 */
export const SAVE_DELAY_MS = 300;

export type SettingsState = {
  readonly settings: Settings;
  /** loading：还在读；ready：可以改；readonly：后端没有这个接口（404/501），用默认值；failed：读取失败。 */
  readonly status: "loading" | "ready" | "readonly" | "failed";
  readonly saving: boolean;
  readonly saved: boolean;
  readonly error: string;
  /** 改设置：立刻显示新值，稍后保存；保存失败时退回上一次保存的样子。 */
  readonly save: (next: Settings) => void;
};

/**
 * 读设置，改设置自动保存（防抖后整体 PUT）。保存失败就回滚到上一次保存成功的样子并给出原因；
 * 保存期间又有新的修改，等这一次结束后再发最新的一份。
 */
export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<SettingsState["status"]>("loading");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const confirmed = useRef<Settings>(DEFAULT_SETTINGS);
  const latest = useRef<Settings>(DEFAULT_SETTINGS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    let gone = false;
    getSettings()
      .then((next) => {
        if (gone) return;
        confirmed.current = next;
        latest.current = next;
        setSettings(next);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (gone) return;
        // 旧版本的控制面没有这个接口：用默认值，设置只读，不当成错误。
        if (err instanceof ApiError && (err.status === 404 || err.status === 501)) setStatus("readonly");
        else {
          setStatus("failed");
          setError(describeFailure("读取设置失败", err));
        }
      });
    return () => {
      gone = true;
    };
  }, []);

  const flush = useCallback(async () => {
    timer.current = null;
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    setSaving(true);
    const body = latest.current;
    try {
      const result = await putSettings(body);
      confirmed.current = result;
      // 保存期间又改了的话，界面上留着新的，等下一次保存。
      if (latest.current === body) {
        latest.current = result;
        setSettings(result);
      }
      setSaved(true);
    } catch (err) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      again.current = false;
      latest.current = confirmed.current;
      setSettings(confirmed.current);
      setSaved(false);
      setError(describeFailure("保存设置失败，已恢复原来的设置", err));
    } finally {
      inflight.current = false;
      setSaving(false);
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, []);

  const save = useCallback(
    (next: Settings) => {
      latest.current = next;
      setSettings(next);
      setError("");
      setSaved(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  // 离开页面时还没发出去的修改立刻发出去，不丢。
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void putSettings(latest.current).catch(() => undefined);
      }
    },
    [],
  );

  return { settings, status, saving, saved, error, save };
}
