// Browser-only FFmpeg.wasm wrapper for episode-level video stitching.
// Ported from vexo-learn/lib/ffmpeg-wasm.ts and trimmed to the bare minimum:
// concatenate N MP4 URLs into one normalized MP4 Blob — no trim, no transitions,
// no audio swap. Each clip's own audio is preserved.
//
// FFmpeg.wasm needs SharedArrayBuffer, which requires COOP+COEP headers on the
// host page. next.config.mjs adds them for /episodes/:id*.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let _ff: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (_ff) return _ff;
  const ff = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  _ff = ff;
  return ff;
}

export type StitchProgress = (pct: number, message: string) => void;
export type StitchOptions = { transition?: "none" | "xfade"; xfadeSeconds?: number };

// Probe a clip's duration in seconds via ffprobe-equivalent (read container).
async function probeDuration(ff: FFmpeg, name: string): Promise<number> {
  // Quick trick: re-encode with -f null and parse stderr. Cheaper to just
  // attempt to read it via ffmpeg's own probe — capture the stderr log line.
  let dur = 0;
  const handler = (msg: { message: string }) => {
    const m = msg.message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) dur = +m[1] * 3600 + +m[2] * 60 + +m[3];
  };
  ff.on("log", handler);
  await ff.exec(["-i", name, "-f", "null", "-"]);
  ff.off("log", handler);
  return dur;
}

export async function stitchClipsInBrowser(clipUrls: string[], onProgress?: StitchProgress, opts: StitchOptions = {}): Promise<Blob> {
  if (clipUrls.length === 0) throw new Error("no clips to stitch");
  const tick = (p: number, m: string) => onProgress?.(Math.max(0, Math.min(100, Math.round(p))), m);
  const transition = opts.transition ?? "xfade";
  const xfadeSec = opts.xfadeSeconds ?? 0.5;

  tick(2, "טוען FFmpeg.wasm…");
  const ff = await getFFmpeg();
  ff.on("progress", ({ progress }: { progress: number }) => tick(20 + progress * 70, "מקודד…"));

  // 1. Download every clip into the WASM virtual filesystem.
  const inputNames: string[] = [];
  for (let i = 0; i < clipUrls.length; i++) {
    tick(5 + (i / clipUrls.length) * 10, `מוריד קליפ ${i + 1}/${clipUrls.length}…`);
    const data = await fetchFile(clipUrls[i]);
    const name = `in${i}.mp4`;
    await ff.writeFile(name, data);
    inputNames.push(name);
  }

  // 2. Normalize each clip to 1280×720 / 30 fps / H.264 / AAC.
  const normalizedNames: string[] = [];
  for (let i = 0; i < clipUrls.length; i++) {
    const out = `n${i}.mp4`;
    tick(15 + (i / clipUrls.length) * 5, `מנרמל קליפ ${i + 1}/${clipUrls.length}…`);
    await ff.exec([
      "-i", inputNames[i],
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      "-y", out,
    ]);
    normalizedNames.push(out);
  }

  // 3. Concat. If transition=xfade and we have ≥2 clips, build a complex
  //    filtergraph that overlaps each clip with the previous one for
  //    xfadeSec seconds — both for video (xfade) and audio (acrossfade).
  //    Otherwise fall back to the fast concat demuxer.
  if (transition === "xfade" && normalizedNames.length >= 2) {
    tick(82, `מוסיף מעברים (${xfadeSec}s)…`);
    // Probe durations so we know offsets.
    const durations: number[] = [];
    for (const n of normalizedNames) durations.push(await probeDuration(ff, n));

    // Build inputs and filtergraph
    const inputs: string[] = [];
    for (const n of normalizedNames) { inputs.push("-i", n); }

    let videoChain = "";
    let audioChain = "";
    let lastV = "[0:v]";
    let lastA = "[0:a]";
    let cumOffset = 0;
    for (let i = 1; i < normalizedNames.length; i++) {
      cumOffset += durations[i - 1] - xfadeSec;
      const vTag = i === normalizedNames.length - 1 ? "[vout]" : `[v${i}]`;
      const aTag = i === normalizedNames.length - 1 ? "[aout]" : `[a${i}]`;
      videoChain += `${lastV}[${i}:v]xfade=transition=fade:duration=${xfadeSec}:offset=${cumOffset.toFixed(3)}${vTag};`;
      audioChain += `${lastA}[${i}:a]acrossfade=d=${xfadeSec}${aTag};`;
      lastV = vTag; lastA = aTag;
    }
    const filter = videoChain + audioChain;

    await ff.exec([
      ...inputs,
      "-filter_complex", filter.replace(/;$/, ""),
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-y", "merged.mp4",
    ]);
  } else {
    const list = normalizedNames.map((n) => `file '${n}'`).join("\n");
    await ff.writeFile("list.txt", new TextEncoder().encode(list));
    tick(88, "מאחד קליפים…");
    await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-y", "merged.mp4"]);
  }

  tick(96, "אורז קובץ…");
  const data = await ff.readFile("merged.mp4");
  await Promise.all([
    ...inputNames.map((n) => ff.deleteFile(n).catch(() => {})),
    ...normalizedNames.map((n) => ff.deleteFile(n).catch(() => {})),
    ff.deleteFile("list.txt").catch(() => {}),
    ff.deleteFile("merged.mp4").catch(() => {}),
  ]);
  tick(100, "הושלם");
  return new Blob([data as BlobPart], { type: "video/mp4" });
}
