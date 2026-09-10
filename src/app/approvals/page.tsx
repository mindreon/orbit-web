export default function ApprovalsPage() {
  return (
    <section aria-labelledby="approvals-title">
      <h1 id="approvals-title" className="text-xl font-semibold">
        Approvals
      </h1>
      <ul className="mt-6 list-none border-t border-zinc-200 p-0">
        {/* Empty HITL list stub. No approve/reject actions in W0. */}
      </ul>
      <p className="mt-4 text-sm text-zinc-500">Empty list. HITL actions are out of W0.</p>
    </section>
  );
}
