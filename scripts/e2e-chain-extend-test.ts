/**
 * End-to-end test: drive the opening wizard via the API to produce a 60s
 * Sora chain-extend clip using the new "character-artistic-hybrid" default.
 *
 *   login → suggest-styles → build-prompt → generate → poll chunks → done
 */

const BASE = "https://vexo-studio.vercel.app";
const SEASON_ID = "cmny2goc10007u7yrbs849yo4"; // Echoes of Tomorrow · S1
const TARGET_SECONDS = 60;
const EMAIL = "admin@vexo.studio";
const PASSWORD = "Vexo@2025!";

async function jfetch(url: string, init: RequestInit = {}, auth?: string): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as any ?? {}) };
  if (auth) headers["Authorization"] = `Bearer ${auth}`;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${url}\n${text.slice(0, 500)}`);
  return data;
}

async function login(): Promise<string> {
  console.log(`→ login as ${EMAIL}`);
  const r = await jfetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = r?.accessToken ?? r?.token ?? r?.data?.accessToken;
  if (!token) throw new Error("no accessToken in login response: " + JSON.stringify(r).slice(0, 400));
  console.log(`✓ token ok (${token.length} chars)`);
  return token;
}

async function main() {
  const token = await login();

  console.log(`→ suggest-styles on season ${SEASON_ID}`);
  const suggest = await jfetch(`${BASE}/api/v1/seasons/${SEASON_ID}/opening/suggest-styles`, {
    method: "POST", body: JSON.stringify({}),
  }, token);
  const styles = suggest?.data?.styles ?? suggest?.styles ?? [];
  const def = styles.find((s: any) => s.key === "character-artistic-hybrid") ?? styles[0];
  if (!def) throw new Error(`no default style in response: ${JSON.stringify(suggest).slice(0, 400)}`);
  console.log(`✓ default style: ${def.key} — ${def.name}`);

  // Load cast so we can pass characterIds
  console.log(`→ fetching character list`);
  const season: any = await jfetch(`${BASE}/api/v1/seasons/${SEASON_ID}`, {}, token);
  const projectId = season?.data?.series?.projectId ?? season?.series?.projectId;
  if (!projectId) throw new Error("no projectId on season: " + JSON.stringify(season).slice(0, 400));
  const chars: any = await jfetch(`${BASE}/api/v1/projects/${projectId}/characters`, {}, token);
  const charList = chars?.data ?? chars ?? [];
  const characterIds = Array.isArray(charList) ? charList.map((c: any) => c.id).slice(0, 4) : [];
  console.log(`✓ cast: ${charList.slice(0, 4).map((c: any) => c.name).join(", ")}`);

  console.log(`→ build-prompt: ${def.key}, ${TARGET_SECONDS}s, sora-2`);
  const build = await jfetch(`${BASE}/api/v1/seasons/${SEASON_ID}/opening/build-prompt`, {
    method: "POST",
    body: JSON.stringify({
      style: def.key,
      styleLabel: def.name,
      includeCharacters: true,
      characterIds,
      duration: TARGET_SECONDS,
      aspectRatio: "16:9",
      model: "sora-2",
    }),
  }, token);
  const prompt = build?.data?.prompt ?? build?.prompt ?? "";
  console.log(`✓ prompt built (${prompt.length} chars)`);
  console.log(`   head: ${prompt.slice(0, 160)}…`);

  console.log(`→ generate (will split into ${Math.ceil(TARGET_SECONDS / 20)} chunks)`);
  const gen = await jfetch(`${BASE}/api/v1/seasons/${SEASON_ID}/opening/generate`, {
    method: "POST", body: JSON.stringify({}),
  }, token);
  console.log(`✓ generate fired: ${JSON.stringify(gen).slice(0, 300)}`);

  // Poll every 25s and report chunk progress
  const startedAt = Date.now();
  let lastIndex = -1;
  let iter = 0;
  while (iter < 60) { // cap ~25 min
    await new Promise((r) => setTimeout(r, 25_000));
    iter++;
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    const poll: any = await jfetch(`${BASE}/api/v1/seasons/${SEASON_ID}/opening`, {}, token);
    const op = poll?.data?.opening ?? poll?.opening;
    if (!op) { console.log(`[${elapsedSec}s] no opening payload`); continue; }
    const totalChunks = Math.max(op.chunkPrompts?.length ?? 1, 1);
    const chunkIdx = op.chunkIndex ?? 0;
    const pct = Math.round(((chunkIdx + 1) / totalChunks) * 100);
    if (chunkIdx !== lastIndex) {
      console.log(`[${elapsedSec}s] chunk ${chunkIdx + 1}/${totalChunks} · status=${op.status} · ${pct}%`);
      lastIndex = chunkIdx;
    } else {
      console.log(`[${elapsedSec}s] still on chunk ${chunkIdx + 1}/${totalChunks} · status=${op.status}`);
    }
    if (op.status === "READY") {
      console.log(`\n✅ DONE in ${elapsedSec}s`);
      console.log(`   video: ${BASE}${op.videoUrl}`);
      console.log(`   chunks: ${op.chunkVideoIds?.length ?? 1}`);
      return;
    }
    if (op.status === "FAILED") {
      console.log(`\n❌ FAILED at chunk ${chunkIdx + 1}/${totalChunks}`);
      return;
    }
  }
  console.log(`\n⏱ timed out waiting. Run again later — server keeps polling.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
