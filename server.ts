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

// The configured frontend origin is always allowed; localhost on any port is
// allowed too, because Vite bumps the port (5174, ...) when 5173 is taken.
// Any other origin is rejected, so a third-party site cannot embed or drive
// this API from its own pages.
function isAllowedOrigin(value: string | undefined): boolean {
  if (!value) return false;
  if (value === FRONTEND_URL) return true;

  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

// Origin check for every /api request. Browsers omit the Origin header on
// same-origin GET requests but always send Referer, so accepting either is
// enough for the real frontend while non-browser clients (which send
// neither) are rejected.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (isAllowedOrigin(req.headers.origin) || isAllowedOrigin(originOf(req.headers.referer))) {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: unknown origin' });
});
app.use(
  cors({
    origin: FRONTEND_URL,
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

  // Whitelist to bilibili's CDN. Without this check the endpoint is an
  // open proxy that fetches whatever URL an attacker points it at.
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

  const response = await fetch(url, {
    headers: {
      Referer: 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  res.setHeader(
    'Content-Type',
    response.headers.get('content-type') || 'image/jpeg'
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
