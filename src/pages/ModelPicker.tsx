export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-xs hover:bg-[#f3f3f4]"
      aria-label={`模型：${value}`}
      onClick={() => onChange("Auto")}
    >
      {value} ▾
    </button>
  );
}
