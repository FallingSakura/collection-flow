import type { Video } from '../types';

// Unset in development: requests stay relative and Vite proxies /api.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** Proxied by the backend: bilibili's CDN rejects another site's Referer. */
export function coverUrl(cover: string): string {
  return apiUrl(`/api/cover?url=${encodeURIComponent(cover)}`);
}

// Throws the server's `error` text (e.g. "账号未登录") rather than the status
// code: it is what tells the user whether their cookie has expired.
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

/** Takes the aids' own cookie: a batch can outlive an account switch. */
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
