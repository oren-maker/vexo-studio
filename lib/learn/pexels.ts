export type PexelsVideo = {
  id: number;
  url: string;
  image: string;
  duration: number;
  user: { name: string; url: string };
  video_files: Array<{ quality: string; width: number; height: number; link: string }>;
};

export type VideoSuggestion = {
  source: "pexels";
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  downloadUrl: string;
  previewUrl: string;
  author: string;
  authorUrl: string;
};

export async function searchPexels(query: string, perPage = 3): Promise<VideoSuggestion[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY חסר");
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}`,
    { headers: { Authorization: key } }
  );
  if (!res.ok) throw new Error(`Pexels error ${res.status}`);
  const json = await res.json();
  const videos: PexelsVideo[] = json.videos || [];
  return videos.map((v) => {
    const hd = v.video_files.find((f) => f.quality === "hd") || v.video_files[0];
    return {
      source: "pexels",
      id: String(v.id),
      title: `Pexels video by ${v.user.name}`,
      thumbnail: v.image,
      duration: v.duration,
      downloadUrl: hd?.link || "",
      previewUrl: v.url,
      author: v.user.name,
      authorUrl: v.user.url,
    };
  });
}
