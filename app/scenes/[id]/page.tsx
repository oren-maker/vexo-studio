"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";

type Frame = { id: string; orderIndex: number; beatSummary: string | null; imagePrompt: string | null; status: string; generatedImageUrl: string | null; approvedImageUrl: string | null };
type Comment = { id: string; body: string; resolved: boolean; createdAt: string; user: { id: string; fullName: string; email: string } };
type Critic = { id: string; contentType: string; score: number; feedback: string | null; createdAt: string };
type SceneChar = { id: string; name: string; roleType: string | null; media: { fileUrl: string }[] };
type Scene = { id: string; sceneNumber: number; title: string | null; summary: string | null; scriptText: string | null; status: string; actualCost: number; episodeId: string | null; memoryContext?: { characters?: string[] } | null; frames: Frame[]; criticReviews: Critic[]; comments: Comment[]; sceneCharacters?: SceneChar[] };

export default function ScenePage() {
  const { id } = useParams<{ id: string }>();
  const lang = useLang();
  const he = lang === "he";
  const [scene, setScene] = useState<Scene | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const s = await api<Scene>(`/api/v1/scenes/${id}`);
    setScene(s);
    setComments(await api<Comment[]>(`/api/v1/scenes/${id}/comments`).catch(() => []));
  }
  useEffect(() => { load(); }, [id]);

  const [lightbox, setLightbox] = useState<{ url: string; title: string; sub: string } | null>(null);
  const [imageModel, setImageModel] = useState<"nano-banana">("nano-banana");
  const [videoModel, setVideoModel] = useState<"seedance" | "kling">("seedance");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");

  async function genStoryboard() {
    // Client-side guard: if the scene lists characters, all must have gallery images
    const missing = (scene?.sceneCharacters ?? []).filter((c) => c.media.length === 0);
    if (missing.length > 0) {
      alert((he ? "לא ניתן לייצר תשריט — לדמויות הבאות אין תמונות בגלריה: " : "Cannot generate — these characters have no gallery images: ") + missing.map((c) => c.name).join(", "));
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ framesGenerated: number; framesTotal: number; estimate: { estimate: number }; model: string }>(`/api/v1/scenes/${id}/generate-storyboard`, {
        method: "POST", body: { imageModel, aspectRatio: aspect },
      });
      alert((he ? `נוצרו ${r.framesGenerated}/${r.framesTotal} מסגרות עם ${r.model}. עלות משוערת: $${r.estimate.estimate.toFixed(2)}` : `Generated ${r.framesGenerated}/${r.framesTotal} frames with ${r.model}. Est cost: $${r.estimate.estimate.toFixed(2)}`));
      setTimeout(load, 1500);
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function genVideo() {
    setBusy(true);
    try {
      const r = await api<{ jobId: string; model?: string; framework?: string }>(`/api/v1/scenes/${id}/generate-video`, {
        method: "POST", body: { videoModel, aspectRatio: aspect },
      });
      alert(`Video job queued via ${r.model ?? videoModel} (${r.framework ?? "queue"}). Job ID: ${r.jobId}\nResult will arrive via webhook in 30-90s.`);
      setTimeout(load, 1500);
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function approve() {
    await api(`/api/v1/scenes/${id}/approve`, { method: "POST" });
    load();
  }

  async function critic() {
    await api(`/api/v1/scenes/${id}/critic/review`, { method: "POST" });
    load();
  }

  async function breakdown() {
    await api(`/api/v1/scenes/${id}/breakdown`, { method: "POST" });
    alert("Script breakdown queued.");
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await api(`/api/v1/scenes/${id}/comments`, { method: "POST", body: { body: newComment } });
    setNewComment("");
    setComments(await api<Comment[]>(`/api/v1/scenes/${id}/comments`));
  }

  async function saveScript(text: string) {
    await api(`/api/v1/scenes/${id}`, { method: "PATCH", body: { scriptText: text } });
  }
  async function saveField(field: "title" | "summary", value: string) {
    await api(`/api/v1/scenes/${id}`, { method: "PATCH", body: { [field]: value } });
    load();
  }
  const [editTitle, setEditTitle] = useState(false);
  const [editSummary, setEditSummary] = useState(false);

  if (!scene) return <div className="text-text-muted">{he ? "טוען…" : "Loading…"}</div>;

  return (
    <div className="space-y-4">
      {scene.episodeId && (
        <Link href={`/episodes/${scene.episodeId}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          {he ? "→ חזרה לפרק" : "← Back to episode"}
        </Link>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div data-no-translate className="text-xs text-text-muted font-mono">SC{String(scene.sceneNumber).padStart(2, "0")}</div>
            {editTitle ? (
              <input autoFocus defaultValue={scene.title ?? ""}
                onBlur={(e) => { setEditTitle(false); saveField("title", e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditTitle(false); }}
                className="text-2xl font-bold bg-bg-main rounded-lg px-2 py-1 w-full" />
            ) : (
              <h1 className="text-2xl font-bold group cursor-text" onClick={() => setEditTitle(true)} title={he ? "לחץ לעריכה" : "Click to edit"}>
                {scene.title ?? (he ? "סצנה ללא שם" : "Untitled scene")}
                <span className="opacity-0 group-hover:opacity-50 text-base ms-2">✎</span>
              </h1>
            )}
            {editSummary ? (
              <textarea autoFocus defaultValue={scene.summary ?? ""} rows={2}
                onBlur={(e) => { setEditSummary(false); saveField("summary", e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Escape") setEditSummary(false); }}
                placeholder={he ? "תיאור הסצנה" : "Scene summary"}
                className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm mt-1" />
            ) : (
              <div className="mt-1 group">
                {scene.summary ? (
                  <p className="text-text-secondary text-sm cursor-text inline" onClick={() => setEditSummary(true)}>{scene.summary}<span className="opacity-0 group-hover:opacity-50 text-xs ms-2">✎</span></p>
                ) : (
                  <button onClick={() => setEditSummary(true)} className="text-xs text-text-muted hover:text-accent">+ {he ? "הוסף תיאור" : "Add summary"}</button>
                )}
              </div>
            )}
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-bg-main font-bold whitespace-nowrap">{scene.status}</span>
        </div>

        <div className="bg-bg-card rounded-card p-3 border border-bg-main flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">{he ? "מודל תמונה" : "Image model"}</span>
            <select value={imageModel} onChange={(e) => setImageModel(e.target.value as never)} className="px-2 py-1 rounded border border-bg-main text-sm">
              <option value="nano-banana">Nano Banana (Gemini 2.5 Flash Image)</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">{he ? "מודל וידאו" : "Video model"}</span>
            <select value={videoModel} onChange={(e) => setVideoModel(e.target.value as never)} className="px-2 py-1 rounded border border-bg-main text-sm">
              <option value="seedance">SeeDance Pro (ByteDance)</option>
              <option value="kling">Kling 2.1 Master</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">{he ? "יחס" : "Aspect"}</span>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as never)} className="px-2 py-1 rounded border border-bg-main text-sm">
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={genStoryboard} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90">{he ? "צור תשריט" : "Generate storyboard"}</button>
          <button disabled={busy} onClick={genVideo} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90">{he ? "צור וידאו" : "Generate video"}</button>
          <button onClick={breakdown} className="px-3 py-1.5 rounded-lg border-2 border-accent text-accent bg-white text-sm font-semibold hover:bg-accent hover:text-white transition-colors">{he ? "פירוק תסריט" : "Script breakdown"}</button>
          <button onClick={critic} className="px-3 py-1.5 rounded-lg border-2 border-accent text-accent bg-white text-sm font-semibold hover:bg-accent hover:text-white transition-colors">{he ? "מבקר AI" : "AI critic"}</button>
          <button onClick={approve} className="px-3 py-1.5 rounded-lg border-2 border-status-okText text-status-okText bg-white text-sm font-semibold hover:bg-status-okText hover:text-white transition-colors">{he ? "אשר סצנה" : "Approve"}</button>
        </div>

        {scene.sceneCharacters && scene.sceneCharacters.length > 0 && (
          <Card title={he ? "דמויות בסצנה" : "Characters in this scene"} subtitle={he ? "מי שמופיעים (משמש גם לעקביות חזותית בייצור)" : "Who appears (also used for visual consistency during generation)"}>
            <div className="flex gap-3 flex-wrap">
              {scene.sceneCharacters.map((c) => {
                const missing = c.media.length === 0;
                return (
                  <div key={c.id} className={`flex items-center gap-2 rounded-full pe-3 ps-0.5 py-0.5 ${missing ? "bg-status-errBg" : "bg-bg-main"}`}>
                    {c.media[0] ? (
                      <img src={c.media[0].fileUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-bg-card flex items-center justify-center text-xs">🎭</div>
                    )}
                    <div className="text-sm">
                      <div className="font-medium">{c.name}</div>
                      {missing && <div className="text-[10px] text-status-errText">{he ? "חסרה גלריה" : "needs gallery"}</div>}
                      {!missing && c.roleType && <div className="text-[10px] text-text-muted">{c.roleType}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card title={he ? "תסריט" : "Script"}>
          <textarea defaultValue={scene.scriptText ?? ""} onBlur={(e) => saveScript(e.target.value)} rows={10} className="w-full px-3 py-2 rounded-lg border border-bg-main font-mono text-sm" placeholder={he ? "מספר: פעם אחת..." : "NARRATOR: Once upon a time…"} />
        </Card>

        <Card title={he ? "מסגרות תשריט" : "Storyboard frames"} subtitle={`${scene.frames.length} ${he ? "מסגרות" : "frames"}`}>
          {scene.frames.length === 0 ? (
            <div className="text-text-muted text-sm">{he ? "אין מסגרות עדיין. לחץ \"צור תשריט\" להתחיל." : "No frames yet. Click \"Generate storyboard\" to start."}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {scene.frames.map((f) => {
                const url = f.approvedImageUrl || f.generatedImageUrl;
                return (
                  <div key={f.id} className="bg-bg-main rounded-lg p-3 text-xs">
                    {url ? (
                      <button onClick={() => setLightbox({ url, title: f.beatSummary ?? "", sub: `${he ? "מסגרת" : "Frame"} ${f.orderIndex + 1}` })} className="block w-full aspect-video bg-bg-card rounded mb-2 overflow-hidden group">
                        <img src={url} alt={f.beatSummary ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </button>
                    ) : (
                      <div className="aspect-video bg-bg-card rounded mb-2 grid place-items-center text-text-muted">
                        <div className="text-center">
                          <div className="text-2xl mb-1">—</div>
                          <div className="text-[10px]">{he ? "ממתין לתמונה" : "pending image"}</div>
                        </div>
                      </div>
                    )}
                    <div className="font-semibold">{he ? `מסגרת ${f.orderIndex + 1}` : `Frame ${f.orderIndex + 1}`}</div>
                    <div className="text-text-secondary line-clamp-2">{f.beatSummary ?? "—"}</div>
                    <div className="text-text-muted mt-1">{f.status}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card title={he ? "מבקר AI" : "AI Critic"} subtitle={`${scene.criticReviews.length} ${he ? "ביקורות" : "reviews"}`}>
          {scene.criticReviews.length === 0 ? (
            <div className="text-text-muted text-sm">{he ? "אין ביקורות עדיין." : "No reviews yet."}</div>
          ) : (
            <ul className="space-y-3">
              {scene.criticReviews.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold">{r.contentType}</span>
                    <span className="num font-bold" style={{ color: r.score > 0.7 ? "#1db868" : r.score > 0.4 ? "#f0a500" : "#e03a4e" }}>{(r.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-text-secondary text-xs">{r.feedback ?? "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={he ? "תגובות" : "Comments"} subtitle={`${comments.length} ${he ? "תגובות" : "comments"}`}>
          <form onSubmit={postComment} className="mb-4">
            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} placeholder={he ? "השאר תגובה..." : "Leave a comment…"} className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm mb-2" />
            <button className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">{he ? "פרסם" : "Post"}</button>
          </form>
          {comments.length === 0 ? (
            <div className="text-text-muted text-sm">{he ? "אין תגובות עדיין." : "No comments yet."}</div>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className={`text-sm ${c.resolved ? "opacity-60" : ""}`}>
                  <div className="font-semibold text-xs">{c.user.fullName}</div>
                  <div className="text-text-secondary">{c.body}</div>
                  <div className="text-[10px] text-text-muted">{new Date(c.createdAt).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setLightbox(null)}>
          <div className="relative max-w-5xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.title} className="max-w-full max-h-[85vh] rounded-lg" />
            <div className="absolute top-2 end-2 flex gap-2">
              <span className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full max-w-md truncate">{lightbox.sub} · {lightbox.title}</span>
              <button onClick={() => setLightbox(null)} className="bg-black/70 text-white w-8 h-8 rounded-full">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
