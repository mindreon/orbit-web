import { useEffect, useState } from "react";

/** 输入框防抖：值停下来 delayMs 后才更新。搜索请求依赖这个值就不会每键一发。 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
