/** Copy of `Video` in server/server.ts; the packages share no code. */
export interface Video {
  aid: number;
  title: string;
  bvid: string;
  cover: string;
  author: string;
  duration: number;
  url: string;
}
