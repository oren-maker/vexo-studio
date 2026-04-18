const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";
const id = process.argv[2];
if (!id) { console.error("usage: tsx check-sora-status.ts <videoId>"); process.exit(1); }
(async () => {
  const r = await fetch(`https://api.openai.com/v1/videos/${id}`, { headers: { Authorization: `Bearer ${KEY}` } });
  console.log("status=" + r.status);
  console.log(JSON.stringify(await r.json(), null, 2));
})();
