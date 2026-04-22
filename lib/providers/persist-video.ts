// Download a provider-hosted video (Sora / VEO) and upload to Vercel Blob so
// the <video> tag can load it without calling back to the provider on every
// request. Before this helper, every Sora/VEO asset stored a proxy URL
// (/api/v1/videos/sora-proxy?id=…) that required a live provider key to
// stream. When the key rotated or expired, every stored video went black.
//
// Design:
//   - Download bytes from the provider using their auth.
//   - put() to Vercel Blob under a stable path including the scene/opening id.
//   - Return the permanent public Blob URL + caller stores it in Asset.fileUrl.
//   - Never throw: on download failure, return { blobUrl: null, error } so the
//     caller can fall back to the proxy URL and surface the issue upstream.

import { put } from "@vercel/blob";
import { downloadSoraVideo } from "./openai-sora";
import { downloadVeoVideo } from "./google-veo";

export type PersistResult =
  | { blobUrl: string; error?: never }
  | { blobUrl: null; error: string };

async function persist(
  bytes: Buffer,
  mimeType: string,
  keyPath: string,
): Promise<PersistResult> {
  try {
    const blob = await put(keyPath, bytes, { access: "public", contentType: mimeType || "video/mp4" });
    return { blobUrl: blob.url };
  } catch (e: any) {
    return { blobUrl: null, error: `blob put failed: ${e?.message ?? e}` };
  }
}

export async function persistSoraToBlob(opts: {
  soraVideoId: string;
  scopeId: string; // scene id / opening id / etc. for the blob path
  scopeKind: "scene" | "opening" | "frame" | "other";
}): Promise<PersistResult> {
  try {
    const { bytes, mimeType } = await downloadSoraVideo(opts.soraVideoId);
    const key = `videos/${opts.scopeKind}/${opts.scopeId}/${opts.soraVideoId}-${Date.now()}.mp4`;
    return await persist(bytes, mimeType, key);
  } catch (e: any) {
    return { blobUrl: null, error: `sora download failed: ${e?.message ?? e}` };
  }
}

export async function persistVeoToBlob(opts: {
  veoUri: string;
  scopeId: string;
  scopeKind: "scene" | "opening" | "frame" | "other";
}): Promise<PersistResult> {
  try {
    const { bytes, mimeType } = await downloadVeoVideo(opts.veoUri);
    const key = `videos/${opts.scopeKind}/${opts.scopeId}/veo-${Date.now()}.mp4`;
    return await persist(bytes, mimeType, key);
  } catch (e: any) {
    return { blobUrl: null, error: `veo download failed: ${e?.message ?? e}` };
  }
}
