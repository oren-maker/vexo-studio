/**
 * Browser → Vercel Blob upload helper.
 * Requires `BLOB_READ_WRITE_TOKEN` env var set on Vercel; the token is exposed
 * to the client through a tiny signed-URL handshake handled by @vercel/blob.
 *
 * For our use case (merged episode MP4 from FFmpeg.wasm) the simplest path is
 * the multipart upload returned by put() with `access: "public"`.
 */
import { upload } from "@vercel/blob/client";

export async function uploadMergedEpisode(
  blob: Blob,
  episodeId: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; size: number }> {
  const filename = `episodes/${episodeId}/merged-${Date.now()}.mp4`;
  const result = await upload(filename, blob, {
    access: "public",
    handleUploadUrl: "/api/v1/blob/upload-token",
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
  });
  return { url: result.url, size: blob.size };
}
