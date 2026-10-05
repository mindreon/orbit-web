import { useState } from "react";

/** 图标加载失败时自动露出首字母。src 是 control 的 /icon 接口，未收录时 404。 */
export function CatalogAvatar({
  src,
  fallback,
  fallbackChar = "·",
  className = "h-10 w-10 text-body",
  style,
}: {
  src: string;
  fallback: string;
  /** 名字为空时的占位字符。 */
  fallbackChar?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-control bg-accent font-semibold text-accent-foreground ${className}`} style={style}>
      {fallback.trim().slice(0, 1) || fallbackChar}
      {!failed ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
