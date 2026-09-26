/** Static placeholder for P0 UI-only destinations that are not wired to the backend yet. */

export function UnwiredPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#f7f7f8] px-8 text-center">
      <p className="text-lg font-medium text-[#b0b0b0]">{title}</p>
      <p className="mt-2 text-sm text-[#b0b0b0]">未接入</p>
      <p className="mt-4 max-w-md text-sm text-[#999]">此功能尚未接入后端，敬请期待。</p>
    </div>
  );
}
