import * as Primitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
export function Tabs({ value, onValueChange, items, label }: { value: string; onValueChange(value: string): void; label: string; items: readonly { value: string; label: string; content: ReactNode }[] }) {
  return <Primitive.Root value={value} onValueChange={onValueChange}><Primitive.List aria-label={label} className="flex flex-wrap gap-2 border-b border-border">{items.map((item) => <Primitive.Trigger key={item.value} value={item.value} className="min-h-11 px-3 text-body data-[state=active]:border-b-2 data-[state=active]:border-primary-600 data-[state=active]:text-primary-700">{item.label}</Primitive.Trigger>)}</Primitive.List>{items.map((item) => <Primitive.Content key={item.value} value={item.value} className="py-4">{item.content}</Primitive.Content>)}</Primitive.Root>;
}
