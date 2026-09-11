"use client";

import { useEffect, useState } from "react";
import { control, type Approval } from "@/lib/control";

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await control.listApprovals();
    setItems(res.items);
  }

  useEffect(() => {
    const start = window.setTimeout(() => {
      load().catch((err: unknown) => setError(String(err)));
    }, 0);
    const timer = window.setInterval(() => {
      load().catch((err: unknown) => setError(String(err)));
    }, 2000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, []);

  async function decide(id: string, decision: "allow" | "reject") {
    setBusy(true);
    try {
      await control.decide(id, decision);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const pending = items.filter((a) => a.status === "pending").length;

  return (
    <section aria-labelledby="approvals-title">
      <h1 id="approvals-title" className="text-xl font-semibold">
        Approvals
      </h1>
      <p className="mt-1 text-sm text-zinc-500">{pending} pending</p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <ul className="mt-6 list-none space-y-3 p-0">
        {items.length === 0 ? (
          <li className="text-sm text-zinc-500">Empty list.</li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="rounded-md border border-zinc-200 bg-white p-4">
              <p className="text-sm font-medium">{item.toolName || "tool"}</p>
              <p className="text-xs text-zinc-500">
                {item.status}
                {item.decision ? ` · ${item.decision}` : ""} · room {item.roomId}
              </p>
              {item.reason ? <p className="mt-1 text-sm">{item.reason}</p> : null}
              {item.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded bg-zinc-900 px-3 py-1 text-sm text-white"
                    onClick={() => void decide(item.id, "allow")}
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded border border-zinc-300 px-3 py-1 text-sm"
                    onClick={() => void decide(item.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
