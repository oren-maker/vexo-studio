"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Frame = { id: string; orderIndex: number; beatSummary: string | null; imagePrompt: string | null; status: string; generatedImageUrl: string | null; approvedImageUrl: string | null };
type Comment = { id: string; body: string; resolved: boolean; createdAt: string; user: { id: string; fullName: string; email: string } };
type Critic = { id: string; contentType: string; score: number; feedback: string | null; createdAt: string };
type Scene = { id: string; sceneNumber: number; title: string | null; summary: string | null; scriptText: string | null; status: string; actualCost: number; frames: Frame[]; criticReviews: Critic[]; comments: Comment[] };

export default function ScenePage() {
  const { id } = useParams<{ id: string }>();
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

  async function genStoryboard() {
    setBusy(true);
    try {
      const r = await api<{ jobId: string; estimate: { estimate: number } }>(`/api/v1/scenes/${id}/generate-storyboard`, { method: "POST" });
      alert(`Job ${r.jobId} queued. Est cost: $${r.estimate.estimate.toFixed(2)}`);
      setTimeout(load, 1500);
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function genVideo() {
    setBusy(true);
    try {
      const r = await api<{ jobId: string }>(`/api/v1/scenes/${id}/generate-video`, { method: "POST" });
      alert(`Video job ${r.jobId} queued.`);
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

  if (!scene) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-text-muted font-mono">SC{String(scene.sceneNumber).padStart(2, "0")}</div>
            <h1 className="text-2xl font-bold">{scene.title ?? "Untitled scene"}</h1>
            {scene.summary && <p className="text-text-secondary text-sm mt-1">{scene.summary}</p>}
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-bg-main font-bold whitespace-nowrap">{scene.status}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={genStoryboard} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">Generate storyboard</button>
          <button disabled={busy} onClick={genVideo} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">Generate video</button>
          <button onClick={breakdown} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">Script breakdown</button>
          <button onClick={critic} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">AI critic</button>
          <button onClick={approve} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">Approve</button>
        </div>

        <Card title="Script">
          <textarea defaultValue={scene.scriptText ?? ""} onBlur={(e) => saveScript(e.target.value)} rows={10} className="w-full px-3 py-2 rounded-lg border border-bg-main font-mono text-sm" placeholder="NARRATOR: Once upon a time…" />
        </Card>

        <Card title="Storyboard frames" subtitle={`${scene.frames.length} frames`}>
          {scene.frames.length === 0 ? (
            <div className="text-text-muted text-sm">No frames yet. Click "Generate storyboard" to start.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {scene.frames.map((f) => (
                <div key={f.id} className="bg-bg-main rounded-lg p-3 text-xs">
                  <div className="aspect-video bg-bg-card rounded mb-2 grid place-items-center text-text-muted">
                    {f.approvedImageUrl || f.generatedImageUrl ? "🖼️" : "—"}
                  </div>
                  <div className="font-semibold">Frame {f.orderIndex + 1}</div>
                  <div className="text-text-secondary line-clamp-2">{f.beatSummary ?? "—"}</div>
                  <div className="text-text-muted mt-1">{f.status}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="AI Critic" subtitle={`${scene.criticReviews.length} reviews`}>
          {scene.criticReviews.length === 0 ? (
            <div className="text-text-muted text-sm">No reviews yet.</div>
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

        <Card title="Comments" subtitle={`${comments.length} comments`}>
          <form onSubmit={postComment} className="mb-4">
            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} placeholder="Leave a comment…" className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm mb-2" />
            <button className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">Post</button>
          </form>
          {comments.length === 0 ? (
            <div className="text-text-muted text-sm">No comments yet.</div>
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
  );
}
