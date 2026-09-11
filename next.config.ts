import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor 的浏览器验收通过 127.0.0.1 访问本地开发服务器。
  // Next.js 16 默认只信任 localhost；显式加入该地址才能加载开发资源并完成 hydration。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
