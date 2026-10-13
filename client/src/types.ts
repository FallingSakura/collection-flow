// Mirrors the Video type in server/server.ts, which produces it. The two
// packages are deployed separately and share no code, so the copies are kept
// in sync by hand.
export interface Video {
  aid: number;
  title: string;
  bvid: string;
  cover: string;
  author: string;
  duration: number;
  url: string;
}
