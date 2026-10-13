# client

The Collection Flow frontend: React 19, Vite and Tailwind CSS 4.

Setup, the API and deployment are described in the [root README](../README.md).

Most of the behaviour lives in `src/hooks/useVideos.ts`. The helpers it uses
are in `src/lib/`: `videoApi` (requests to the backend), `videoCache`
(localStorage) and `videoOrder` (pseudo-random and shuffled ordering).
