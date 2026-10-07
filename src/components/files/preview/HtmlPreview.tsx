import type { PreviewProps } from "./types";

export default function HtmlPreview({ name, text = "" }: PreviewProps) {
  // 沙箱里能跑脚本（幻灯片要翻页），但拿不到本页的任何数据和登录态。
  return <iframe title={name} sandbox="allow-scripts" srcDoc={text} className="h-full min-h-[480px] w-full bg-white" />;
}
