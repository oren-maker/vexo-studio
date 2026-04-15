// YouTube Data API v3 — search videos. Returns metadata only (YouTube doesn't allow
// server-side download via yt-dlp on Vercel, so these can't be auto-analyzed through
// the URL flow. Present them as suggestions; user can open the link manually.

import type { VideoSuggestion } from "./pexels";

type YTSearchItem = {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    thumbnails: { high?: { url: string }; default: { url: string } };
    channelTitle: string;
  };
};

export async function searchYouTube(query: string, perPage = 3): Promise<(VideoSuggestion & { unanalyzable: boolean })[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY חסר");

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
    query
  )}&type=video&maxResults=${perPage}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const json = await res.json();
  const items: YTSearchItem[] = json.items || [];

  return items.map((v) => ({
    source: "pexels" as const, // reuse the shape; UI differentiates by unanalyzable flag
    id: v.id.videoId,
    title: v.snippet.title,
    thumbnail: v.snippet.thumbnails.high?.url || v.snippet.thumbnails.default.url,
    duration: 0,
    downloadUrl: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    previewUrl: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    author: v.snippet.channelTitle,
    authorUrl: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    unanalyzable: true, // cannot be auto-fetched for Gemini; manual workflow
  }));
}
