import type { Video } from '../types';

/**
 * The API is a separate deployment in production, so its address comes from the
 * environment. It is left unset during development: requests stay relative to
 * the page, and the Vite dev server proxies /api to localhost:3000 (see
 * vite.config.ts).
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Covers cannot be loaded from bilibili directly — the CDN checks the Referer
 * and answers 403 to a browser on another origin — so the image element asks
 * this app's backend to fetch them. That makes it an API call like any other,
 * which is why its URL is built here instead of in the component.
 */
export function coverUrl(cover: string): string {
  return apiUrl(`/api/cover?url=${encodeURIComponent(cover)}`);
}

/**
 * The two calls this app makes to its own backend, kept apart from the hook so
 * the request and response contract has one home. Nothing here touches React
 * or the cache: callers own the cookie and the bookkeeping around it.
 */

/**
 * Parses the body, and turns a failed request into an Error carrying the
 * server's own message.
 *
 * The message is deliberately the `error` field rather than the status code: a
 * failed bilibili call still returns HTTP 400 with a body like
 * {"error":"账号未登录"}, and that text is what tells the user whether their
 * cookie expired or something else went wrong.
 */
async function readJsonOrThrow(
  res: Response,
  fallback: string
): Promise<unknown> {
  let data: unknown;

  try {
    data = await res.json();
  } catch (error) {
    console.error('Failed to parse response body:', error);

    throw new Error(`Server error: ${res.status}`, {
      cause: error,
    });
  }

  if (res.ok) {
    return data;
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof data.error === 'string' &&
    data.error
  ) {
    throw new Error(data.error);
  }

  throw new Error(fallback);
}

export async function fetchVideos(cookie: string): Promise<Video[]> {
  const res = await fetch(apiUrl('/api/videos'), {
    headers: {
      'x-bili-cookie': cookie,
    },
  });

  const data = await readJsonOrThrow(res, `Server error: ${res.status}`);

  if (!Array.isArray(data)) {
    throw new Error('Server returned invalid video data format');
  }

  return data as Video[];
}

/**
 * Deletes the given aids from the watch-later list. The cookie is the only
 * credential the server checks, so the caller has to pass the one those aids
 * belong to — a batch that outlives an account switch would otherwise delete
 * from the wrong list.
 */
export async function deleteVideos(
  cookie: string,
  aids: number[]
): Promise<void> {
  const res = await fetch(apiUrl('/api/videos/delete'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bili-cookie': cookie,
    },
    body: JSON.stringify({ aids }),
  });

  await readJsonOrThrow(res, '删除失败');
}
