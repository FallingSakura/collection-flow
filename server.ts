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
  title: string;
  bvid: string;
  pic: string;
  duration: number;
  owner: BiliOwner;
}

interface Video {
  title: string;
  bvid: string;
  cover: string;
  author: string;
  duration: number;
  url: string;
}

const app = express();
app.use(express.static('public'));

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
