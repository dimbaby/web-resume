/// <reference types="vite/client" />

declare global {
  interface Window {
    __RESUME_READY__?: boolean;
  }
}

export {};
