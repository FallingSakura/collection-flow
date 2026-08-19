import express, { type Request, type Response } from 'express';

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
app.use(express.static('public'));
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

app.listen(3000, () => {
  console.log('running on http://localhost:3000');
});
