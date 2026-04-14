"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Channel = { id: string; provider: string; channelName: string; channelId: string; isActive: boolean; tokenExpiry: string | null };
type Distribution = { id: string; platform: string; publishingMode: string; defaultPrivacy: string; isActive: boolean };

export default function DistributionPage() {
  const { id } = useParams<{ id: string }>();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dists, setDists] = useState<Distribution[]>([]);

  async function load() {
    setChannels(await api<Channel[]>("/api/v1/integrations/channels").catch(() => []));
    setDists(await api<Distribution[]>(`/api/v1/projects/${id}/distribution`).catch(() => []));
  }
  useEffect(() => { load(); }, [id]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Distribution</h1>
      <Card title="Connected channels" subtitle={`${channels.length} channels`}>
        {channels.length === 0 ? (
          <div className="text-text-muted text-sm">No channels connected yet. Use the API to OAuth-connect a YouTube channel.</div>
        ) : (
          <ul className="space-y-2">
            {channels.map((c) => (
              <li key={c.id} className="bg-bg-main rounded-lg p-3 flex justify-between">
                <div>
                  <div className="font-medium">{c.channelName}</div>
                  <div className="text-xs text-text-muted">{c.provider} · {c.channelId}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? "bg-status-okBg text-status-okText" : "bg-status-errBg text-status-errText"}`}>{c.isActive ? "Active" : "Inactive"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Project distribution config" subtitle={`${dists.length} configs`}>
        {dists.length === 0 ? (
          <div className="text-text-muted text-sm">No distribution configured for this project.</div>
        ) : (
          <ul className="space-y-2">
            {dists.map((d) => (
              <li key={d.id} className="bg-bg-main rounded-lg p-3">
                <div className="font-medium">{d.platform}</div>
                <div className="text-xs text-text-muted">{d.publishingMode} · default privacy: {d.defaultPrivacy}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
