/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 设为 1 时，连接器页不显示 needsOnline 的市场服务。 */
  readonly VITE_ORBIT_OFFLINE?: string;
}
