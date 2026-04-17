import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // Get last 3 brain messages
  const msgs = await p.brainMessage.findMany({
    where: { role: "brain" },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  for (const msg of msgs) {
    console.log(`\n=== msg ${msg.id.slice(-8)} (${msg.createdAt.toISOString().slice(0, 16)}) ===`);
    console.log(`length: ${msg.content.length}`);

    // Try Pass 1: fenced block
    const fenceMatch = msg.content.match(/```+\s*(?:action|json)?\s*\n?([\s\S]*?)\n?```+/);
    if (fenceMatch) {
      console.log(`Pass 1 (fence): found ${fenceMatch[1].length} chars`);
      try {
        let s = fenceMatch[1].trim().replace(/^json\s*/i, "").replace(/^action\s*/i, "");
        s = s.replace(/,(\s*[}\]])/g, "$1");
        const parsed = JSON.parse(s);
        console.log(`  ✅ VALID JSON · type="${parsed.type}" · keys: ${Object.keys(parsed).join(", ")}`);
        console.log(`  prompt length: ${String(parsed.prompt ?? "").length}`);
      } catch (e: any) {
        console.log(`  ❌ JSON PARSE FAILED: ${e.message}`);
        console.log(`  First 200: ${fenceMatch[1].slice(0, 200)}`);
        console.log(`  Last 200: ${fenceMatch[1].slice(-200)}`);
      }
    } else {
      console.log("Pass 1: no fence match");
    }

    // Try Pass 2: jsonHunt
    const jsonHunt = msg.content.match(/\{[\s\S]*?"type"\s*:\s*"(?:compose_prompt|generate_video|import_guide_url|ai_guide|import_instagram_guide|import_source|update_reference|create_episode|update_episode|create_scene|update_scene|update_opening_prompt)"[\s\S]*?\}/);
    if (jsonHunt) {
      console.log(`Pass 2 (jsonHunt): found ${jsonHunt[0].length} chars`);
      try {
        const parsed = JSON.parse(jsonHunt[0]);
        console.log(`  ✅ VALID · type="${parsed.type}"`);
      } catch (e: any) {
        console.log(`  ❌ FAILED: ${e.message}`);
      }
    } else {
      console.log("Pass 2: no jsonHunt match");
    }
  }
  await p.$disconnect();
})();
