/// <reference types="vite/client" />

// Optional: unset in development, where the Vite proxy handles /api.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
