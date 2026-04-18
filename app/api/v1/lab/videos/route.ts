import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lab videos already generated via curl — surface them in the gallery.
// (Temporary: no DB table yet, just a static list.)
const SEED_VIDEOS = [
  {
    id: "lab-v1",
    number: 1,
    requestId: "99b40614-2cf9-46f5-9ccb-5b1c27b4ba92",
    model: "bytedance/seedance/v1/pro/image-to-video",
    durationSec: 5,
    aspectRatio: "16:9",
    videoUrl: "https://d3u0tzju9qaucj.cloudfront.net/cac2ea87-60e9-48f3-825c-040003ab644a/e8750b7c-e7ab-4544-a3ec-b1ccbacdfc91.mp4",
    status: "completed",
    note: "Maya ref image (Seedance image-to-video)",
    createdAt: "2026-04-17T02:20:00Z",
  },
  {
    id: "lab-v2",
    number: 2,
    requestId: "594ed9bb-3a13-4cdd-aadf-f09b751b6fc4",
    model: "bytedance/seedance/v1/pro/image-to-video",
    durationSec: 5,
    aspectRatio: "16:9",
    videoUrl: "https://d3u0tzju9qaucj.cloudfront.net/cac2ea87-60e9-48f3-825c-040003ab644a/8972431f-a3f4-485b-887c-6db348f0a595.mp4",
    status: "completed",
    note: "Maya + Scene 1 plot (hallway → mirror reflection)",
    createdAt: "2026-04-17T02:30:00Z",
  },
  {
    id: "lab-v3",
    number: 3,
    requestId: "511baff7-4d16-4285-8655-f3406ad73fd2",
    model: "bytedance/seedance/v1.5/pro/text-to-video",
    durationSec: 5,
    aspectRatio: "16:9",
    videoUrl: "https://d3u0tzju9qaucj.cloudfront.net/cac2ea87-60e9-48f3-825c-040003ab644a/fc399084-9890-4e95-b30e-41d4eede35f3.mp4",
    status: "completed",
    note: "Design-only (no ref image) — text-to-video from scratch",
    createdAt: "2026-04-17T02:45:00Z",
  },
  {
    id: "lab-v4",
    number: 4,
    requestId: "f4904692-8f74-4910-8ae0-005674c17153",
    model: "bytedance/seedance/v1.5/pro/text-to-video",
    durationSec: 10,
    aspectRatio: "16:9",
    videoUrl: null,
    status: "in_progress",
    note: "10s · No glasses · Full plot (Maya sees the reflection smile)",
    createdAt: "2026-04-17T02:50:00Z",
  },
];

export async function GET() {
  return NextResponse.json({ videos: SEED_VIDEOS });
}
