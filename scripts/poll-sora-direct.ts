/**
 * Read the OpenAI key from .env.prod verbatim (trim any trailing \n
 * characters that bash variable expansion injects) and poll a Sora video id.
 */
import { readFileSync } from "fs";

const envFile = readFileSync("./.env.prod", "utf8");
const match = envFile.match(/^OPENAI_API_KEY="([^"\n]+?)(?:\\n)?"$/m);
if (!match) { console.error("no OPENAI_API_KEY in .env.prod"); process.exit(1); }
const key = match[1];
const videoId = process.argv[2];
if (!videoId) { console.error("usage: poll-sora-direct.ts <video_id>"); process.exit(1); }

(async () => {
  const res = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  console.log(`${res.status} ${text}`);
})();
