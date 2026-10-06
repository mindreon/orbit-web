import { useEffect, useState } from "react";

/** 每隔 `every` 毫秒刷新一次的当前时间：「刚刚 / 5 分钟前」这类相对时间靠它自己走。 */
export function useNow(every = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}
