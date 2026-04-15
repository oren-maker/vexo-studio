// Luma Ray-2 image-to-video transition wrapper via fal.ai.
// Takes 2 keyframes (start + end) and returns a smooth interpolated MP4.

import { fal } from "@fal-ai/client";

let _configured = false;
function configure() {
  if (_configured) return;
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY missing");
  fal.config({ credentials: key });
  _configured = true;
}

export type LumaRay2Result = {
  videoUrl: string;
  requestId: string;
  usdCost: number;
  durationSec: number;
};

export async function lumaRay2Transition(opts: {
  startFrameUrl: string;
  endFrameUrl: string;
  durationSec?: 5 | 9;
  prompt?: string;
}): Promise<LumaRay2Result> {
  configure();
  const duration = opts.durationSec || 5;
  const result: any = await fal.subscribe("fal-ai/luma-dream-machine/ray-2/image-to-video", {
    input: {
      prompt: opts.prompt || "smooth cinematic transition between two scenes",
      keyframes: {
        frame0: { type: "image", url: opts.startFrameUrl },
        frame1: { type: "image", url: opts.endFrameUrl },
      },
      duration: String(duration),
      resolution: "720p",
      aspect_ratio: "16:9",
    } as any,
    logs: false,
  });
  const videoUrl = result?.data?.video?.url || result?.video?.url;
  if (!videoUrl) {
    throw new Error("Luma Ray-2 returned no video URL: " + JSON.stringify(result).slice(0, 300));
  }
  return {
    videoUrl,
    requestId: result?.requestId || "",
    usdCost: duration * 0.08,
    durationSec: duration,
  };
}
