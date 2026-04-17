import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const msg = await p.brainMessage.findFirst({ where: { role: "brain" }, orderBy: { createdAt: "desc" } });
  if (!msg) { console.error("no msg"); return; }
  const fenceMatch = msg.content.match(/```+\s*(?:action|json)?\s*\n?([\s\S]*?)\n?```+/);
  if (!fenceMatch) { console.error("no fence"); return; }
  let s = fenceMatch[1].trim().replace(/^json\s*/i, "").replace(/^action\s*/i, "");
  s = s.replace(/,(\s*[}\]])/g, "$1");
  const action = JSON.parse(s);
  console.log("Action:", action.type, "seasonId:", action.seasonId);
  console.log("Prompt length:", action.prompt?.length);

  // Execute: update opening prompt
  const existing = await p.seasonOpening.findUnique({ where: { seasonId: action.seasonId } });
  if (!existing) { console.error("no opening"); return; }

  // Snapshot old
  if (existing.currentPrompt && existing.currentPrompt !== action.prompt) {
    await p.seasonOpeningPromptVersion.create({
      data: { openingId: existing.id, prompt: existing.currentPrompt },
    });
    console.log("✓ Old prompt snapshotted");
  }

  // Update
  const data: any = { currentPrompt: action.prompt };
  if (action.duration) data.duration = action.duration;
  if (action.model) data.model = action.model;
  if (action.aspectRatio) data.aspectRatio = action.aspectRatio;
  await p.seasonOpening.update({ where: { id: existing.id }, data });
  console.log("✅ Opening prompt updated");
  console.log("   Duration:", action.duration ?? existing.duration);
  console.log("   Model:", action.model ?? existing.model);
  console.log("   Prompt head:", action.prompt.slice(0, 200));
  await p.$disconnect();
})();
