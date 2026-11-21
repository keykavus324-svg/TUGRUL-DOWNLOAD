/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: string;
  readonly VITE_OFFLINE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
