/// <reference types="vite/client" />

// The base URL of the deployed API. Optional on purpose: without it the app
// keeps its requests relative and the dev server proxy takes over.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
