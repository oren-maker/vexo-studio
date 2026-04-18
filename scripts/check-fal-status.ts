const FAL = process.env.FAL_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";
const ID = "019d9e7a-f156-7a63-b4cd-11f7cfcd0048";
const tries = [
  `https://queue.fal.run/fal-ai/vidu/q1/reference-to-video/requests/${ID}/status`,
  `https://queue.fal.run/fal-ai/vidu-q1/requests/${ID}/status`,
  `https://queue.fal.run/fal-ai/vidu/requests/${ID}/status`,
  `https://queue.fal.run/fal-ai/vidu-q1-reference-to-video/requests/${ID}/status`,
  `https://queue.fal.run/fal-ai/vidu/q1/requests/${ID}/status`,
];
(async () => {
  for (const u of tries) {
    const r = await fetch(u, { headers: { Authorization: `Key ${FAL}` } });
    console.log(u);
    console.log("  http=" + r.status + " body=" + (await r.text()).slice(0, 150));
  }
})();
