export function AppMenu({ onPick: _onPick }: { matterId: string | null; onPick: (app: { name: string }) => void }) {
  return <p className="px-3 py-2 text-xs text-[#888]">当前暂无可选应用</p>;
}
