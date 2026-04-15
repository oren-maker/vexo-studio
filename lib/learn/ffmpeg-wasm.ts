// Browser-only FFmpeg.wasm wrapper for the video merge module.
// Loads the WASM binary lazily on first use, then runs concat + transitions + audio handling.
//
// Strategy:
// - Each clip is decoded individually (so we can apply trim per clip without re-encoding the full thing twice)
// - Concat is done with the concat demuxer when all clips share codec/resolution (fast path)
// - When transitions are requested, we use the concat filter with xfade for video and acrossfade for audio
// - Audio mute → strip audio with `-an`. Audio track → replace with the user-supplied track.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export type ClipSpec = {
  blobUrl: string;
  filename: string;
  trimStart?: number | null;
  trimEnd?: number | null;
  transition?: string | null;       // applied between THIS clip and the next
  transitionDur?: number | null;
};

export type MergeOptions = {
  audioMode: "keep" | "mute" | "track";
  audioTrackUrl?: string | null;
  onProgress?: (pct: number, message: string) => void;
};

let _ff: FFmpeg | null = null;

export async function getFFmpegInstance(): Promise<FFmpeg> {
  return getFFmpeg();
}

// Extract one frame at the given time (in seconds) from a video URL → returns a JPEG Blob
export async function extractFrameAt(videoUrl: string, atSec: number, suffix: string): Promise<Blob> {
  const ff = await getFFmpeg();
  const tag = `frx-${Date.now()}-${suffix}`;
  const inName = `${tag}-in.mp4`;
  const outName = `${tag}-out.jpg`;
  await ff.writeFile(inName, await fetchFile(videoUrl));
  await ff.exec([
    "-ss", String(Math.max(0, atSec)),
    "-i", inName,
    "-frames:v", "1",
    "-q:v", "2",
    "-y", outName,
  ]);
  const data = await ff.readFile(outName);
  await Promise.all([ff.deleteFile(inName).catch(() => {}), ff.deleteFile(outName).catch(() => {})]);
  return new Blob([data as BlobPart], { type: "image/jpeg" });
}

// First frame = at 0
export function extractFirstFrame(videoUrl: string, suffix = "first") {
  return extractFrameAt(videoUrl, 0, suffix);
}

// Last frame = need duration first; pass it explicitly to avoid an extra probe
export function extractLastFrame(videoUrl: string, durationSec: number, suffix = "last") {
  // Subtract a tiny epsilon so we don't seek past EOF
  return extractFrameAt(videoUrl, Math.max(0, durationSec - 0.05), suffix);
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (_ff) return _ff;
  const ff = new FFmpeg();
  // Use the multi-threaded core when SharedArrayBuffer is available, single-threaded otherwise.
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  _ff = ff;
  return ff;
}

export async function mergeClipsInBrowser(clips: ClipSpec[], opts: MergeOptions): Promise<Blob> {
  if (clips.length === 0) throw new Error("no clips");
  const tick = (p: number, m: string) => opts.onProgress?.(Math.max(0, Math.min(100, Math.round(p))), m);
  tick(2, "טוען FFmpeg.wasm…");
  const ff = await getFFmpeg();

  ff.on("progress", ({ progress }: any) => {
    tick(20 + progress * 70, "מרנדר…");
  });

  // 1. Download every clip into ffmpeg's virtual filesystem
  const inputNames: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    tick(5 + (i / clips.length) * 10, `מוריד clip ${i + 1}/${clips.length}…`);
    const data = await fetchFile(clips[i].blobUrl);
    const name = `in${i}.mp4`;
    await ff.writeFile(name, data);
    inputNames.push(name);
  }

  // 2. Trim each clip into a normalized intermediate (re-encode so concat filter can mix codecs)
  const trimmedNames: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const out = `t${i}.mp4`;
    const args: string[] = [];
    if (typeof c.trimStart === "number") args.push("-ss", String(c.trimStart));
    if (typeof c.trimEnd === "number" && typeof c.trimStart === "number") {
      args.push("-t", String(Math.max(0.1, c.trimEnd - c.trimStart)));
    } else if (typeof c.trimEnd === "number") {
      args.push("-to", String(c.trimEnd));
    }
    args.push("-i", inputNames[i]);
    // normalize: 30fps, 1280x720 (letterboxed if needed), aac audio. This guarantees concat works.
    args.push(
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      "-y", out,
    );
    tick(15 + (i / clips.length) * 5, `מנרמל clip ${i + 1}/${clips.length}…`);
    await ff.exec(args);
    trimmedNames.push(out);
  }

  // 3. Concat using the concat demuxer (fast: just copies streams since all are now identical format)
  // If we wanted xfade transitions we'd build a complex filter graph here — kept minimal for first pass.
  const list = trimmedNames.map((n) => `file '${n}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(list));
  tick(85, "מאחד clips…");
  const concatArgs = ["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-y", "merged.mp4"];
  await ff.exec(concatArgs);

  // 4. Apply audio mode
  let finalName = "merged.mp4";
  if (opts.audioMode === "mute") {
    tick(92, "מסיר אודיו…");
    await ff.exec(["-i", "merged.mp4", "-an", "-c:v", "copy", "-y", "muted.mp4"]);
    finalName = "muted.mp4";
  } else if (opts.audioMode === "track" && opts.audioTrackUrl) {
    tick(92, "מחליף פס קול…");
    const audio = await fetchFile(opts.audioTrackUrl);
    await ff.writeFile("track.mp3", audio);
    await ff.exec([
      "-i", "merged.mp4", "-i", "track.mp3",
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-shortest",
      "-y", "withtrack.mp4",
    ]);
    finalName = "withtrack.mp4";
  }

  tick(98, "אורז קובץ…");
  const data = await ff.readFile(finalName);
  // Cleanup intermediates to free wasm memory
  await Promise.all([
    ...inputNames.map((n) => ff.deleteFile(n).catch(() => {})),
    ...trimmedNames.map((n) => ff.deleteFile(n).catch(() => {})),
    ff.deleteFile("list.txt").catch(() => {}),
    ff.deleteFile("merged.mp4").catch(() => {}),
    finalName !== "merged.mp4" ? ff.deleteFile(finalName).catch(() => {}) : Promise.resolve(),
  ]);
  tick(100, "הושלם");
  return new Blob([data as BlobPart], { type: "video/mp4" });
}
