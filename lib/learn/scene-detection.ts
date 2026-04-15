// Browser-side scene detection using FFmpeg.wasm.
// Returns scene boundary timestamps + a thumbnail Blob per scene.

import { fetchFile } from "@ffmpeg/util";
import { getFFmpegInstance } from "./ffmpeg-wasm";

export type SceneInfo = {
  startSec: number;
  endSec: number;
  thumbnail: Blob;
};

export async function detectScenes(
  file: File | Blob,
  opts: {
    threshold?: number; // 0.0-1.0, default 0.4 (lower = more cuts)
    onProgress?: (pct: number, msg: string) => void;
  } = {},
): Promise<{ scenes: SceneInfo[]; totalDuration: number }> {
  const threshold = opts.threshold ?? 0.4;
  const tick = (p: number, m: string) => opts.onProgress?.(p, m);

  tick(2, "טוען FFmpeg.wasm…");
  const ff = await getFFmpegInstance();

  const tag = `sd-${Date.now()}`;
  const inName = `${tag}-in.mp4`;
  await ff.writeFile(inName, await fetchFile(file));

  // Capture log lines containing pts_time
  const timestamps: number[] = [];
  let totalDuration = 0;
  const onLog = ({ message }: any) => {
    if (typeof message !== "string") return;
    const ptsMatch = message.match(/pts_time:([\d.]+)/);
    if (ptsMatch) timestamps.push(Number(ptsMatch[1]));
    const durMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (durMatch) {
      const [, h, m, s] = durMatch;
      totalDuration = Number(h) * 3600 + Number(m) * 60 + Number(s);
    }
  };
  ff.on("log", onLog);

  tick(15, "מנתח סצנות…");
  await ff.exec([
    "-i", inName,
    "-vf", `select='gt(scene,${threshold})',showinfo`,
    "-vsync", "vfr",
    "-f", "null",
    "-",
  ]);

  ff.off("log", onLog);

  // Build scene boundaries: [0, t1, t2, ..., totalDuration]
  const boundaries = [0, ...timestamps.filter((t) => t > 0.5 && t < totalDuration - 0.5).sort((a, b) => a - b), totalDuration];
  // Keep at most 30 scenes for sanity
  const trimmed = boundaries.length > 31 ? boundaries.slice(0, 31) : boundaries;

  const scenes: SceneInfo[] = [];
  for (let i = 0; i < trimmed.length - 1; i++) {
    const startSec = trimmed[i];
    const endSec = trimmed[i + 1];
    if (endSec - startSec < 0.4) continue; // skip ultra-short
    tick(20 + (i / trimmed.length) * 70, `מחלץ thumbnail ${i + 1}/${trimmed.length - 1}…`);
    const thumbName = `${tag}-thumb-${i}.jpg`;
    const midSec = startSec + (endSec - startSec) / 2;
    await ff.exec([
      "-ss", String(midSec),
      "-i", inName,
      "-frames:v", "1",
      "-vf", "scale=480:-1",
      "-q:v", "3",
      "-y", thumbName,
    ]);
    const data = await ff.readFile(thumbName);
    scenes.push({ startSec, endSec, thumbnail: new Blob([data as BlobPart], { type: "image/jpeg" }) });
    await ff.deleteFile(thumbName).catch(() => {});
  }

  await ff.deleteFile(inName).catch(() => {});
  tick(95, `נמצאו ${scenes.length} סצנות`);
  return { scenes, totalDuration };
}
