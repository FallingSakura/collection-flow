import 'dotenv/config';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';

interface BiliOwner {
  name: string;
}

interface BiliToViewResponse {
  code: number;
  message: string;
  data: {
    list: BiliVideoItem[];
  };
}

interface BiliVideoItem {
  aid: number;
  title: string;
  bvid: string;
  pic: string;
  duration: number;
  owner: BiliOwner;
}

// Copy of `Video` in client/src/types.ts; the packages share no code.
interface Video {
  aid: number;
  title: string;
  bvid: string;
  cover: string;
  author: string;
  duration: number;
  url: string;
}

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

// A list, so production, preview and custom domains can all be allowed.
// Reduced to origins, so a trailing slash in the variable is harmless.
const FRONTEND_ORIGINS = FRONTEND_URL.split(',')
  .map(value => originOf(value.trim()))
  .filter((value): value is string => value !== undefined);

// localhost on any port, because Vite moves off 5173 when it is taken.
function isAllowedOrigin(value: string | undefined): boolean {
  const origin = originOf(value);
  if (!origin) return false;
  if (FRONTEND_ORIGINS.includes(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

// Browsers omit Origin on same-origin GETs but send Referer, so either counts.
// Both can be forged: this stops other websites, not curl.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (
    isAllowedOrigin(req.headers.origin) ||
    isAllowedOrigin(originOf(req.headers.referer))
  ) {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: unknown origin' });
});
app.use(
  cors({
    origin: FRONTEND_ORIGINS,
    credentials: true,
  })
);
app.use(express.json());

function getCookie(req: Request): string | undefined {
  const cookieHeader = req.headers['x-bili-cookie'];
  return Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
}

app.get('/api/videos', async (req: Request, res: Response) => {
  const cookie = getCookie(req);
  if (!cookie) {
    return res.status(400).json({ error: 'Missing x-bili-cookie header' });
  }

  try {
    const response = await fetch(
      'https://api.bilibili.com/x/v2/history/toview',
      {
        headers: {
          Cookie: cookie,
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://www.bilibili.com',
        },
      }
    );
    const data = (await response.json()) as BiliToViewResponse;

    if (data.code !== 0) {
      throw new Error(data.message);
    }
    const videos: Video[] = data.data.list.map(item => ({
      aid: item.aid,
      title: item.title,
      bvid: item.bvid,
      cover: item.pic,
      author: item.owner.name,
      duration: item.duration,
      url: `https://www.bilibili.com/video/${item.bvid}`,
    }));
    return res.status(200).json(videos);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server Error';
    return res.status(400).json({ error: message });
  }
});

app.post('/api/videos/delete', async (req: Request, res: Response) => {
  const cookie = getCookie(req);
  if (!cookie) {
    return res.status(400).json({ error: 'Missing x-bili-cookie header' });
  }

  const aids = req.body?.aids;
  if (!Array.isArray(aids) || aids.length === 0) {
    return res
      .status(400)
      .json({ error: 'Missing aids array in request body' });
  }

  const csrfMatch = cookie.match(/bili_jct=([^;]+)/);
  const csrf = csrfMatch?.[1];
  if (!csrf) {
    return res
      .status(400)
      .json({ error: 'Cookie is missing bili_jct (required for deletion)' });
  }

  try {
    const params = new URLSearchParams();
    params.set('resources', aids.join(','));
    params.set('csrf', csrf);

    const response = await fetch(
      'https://api.bilibili.com/x/v2/history/toview/v2/dels',
      {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://www.bilibili.com',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    const data = (await response.json()) as { code: number; message: string };
    if (data.code !== 0) {
      throw new Error(data.message || `删除失败，错误码：${data.code}`);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server Error';
    return res.status(400).json({ error: message });
  }
});

app.get('/api/cover', async (req: Request, res: Response) => {
  const url = req.query.url as string | undefined;
  if (!url) return res.status(400).json({ error: 'missing url' });

  // Without this the endpoint is an open proxy for any URL.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return res.status(400).json({ error: 'only http(s) urls are allowed' });
  }
  if (!parsed.hostname.endsWith('.hdslb.com')) {
    return res
      .status(400)
      .json({ error: 'only bilibili CDN (hdslb.com) urls are allowed' });
  }

  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      headers: {
        Referer: 'https://www.bilibili.com',
        'User-Agent': 'Mozilla/5.0',
      },
    });
  } catch (err) {
    console.error('Failed to fetch cover:', err);
    return res.status(502).json({ error: 'failed to reach bilibili CDN' });
  }

  // Before the cache header, or a 403/404 would be cached as the cover.
  if (!response.ok) {
    return res
      .status(502)
      .json({ error: `bilibili CDN responded ${response.status}` });
  }

  res.setHeader(
    'Content-Type',
    response.headers.get('content-type') || 'image/jpeg'
  );

  // Cover URLs are content-addressed (bfs/archive/<sha1>.jpg), so a cached
  // copy does not go stale.
  res.setHeader(
    'Cache-Control',
    'public, max-age=86400, s-maxage=86400, immutable'
  );

  const buffer = await response.arrayBuffer();
  return res.send(Buffer.from(buffer));
});

app.get('/', (req: Request, res: Response) => {
  return res.send('Collection Flow API Server is running.');
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`running on http://localhost:${port}`);
});
