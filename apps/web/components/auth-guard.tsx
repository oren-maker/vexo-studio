"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getAccessToken, setCurrentOrgId } from "@/lib/api";

export type Me = {
  user: {
    id: string; email: string; username: string; fullName: string;
    totpEnabled: boolean;
    organizations: Array<{ organization: { id: string; name: string; slug: string; plan: string }; role: { name: string } }>;
  };
  currentOrganizationId: string;
  memberships: Array<{ organizationId: string; roleName: string; isOwner: boolean; permissions: string[] }>;
};

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<Me>("/api/v1/auth/me");
        if (!cancelled) {
          setMe(data);
          if (data.currentOrganizationId) setCurrentOrgId(data.currentOrganizationId);
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { me, error, loading };
}

export function AuthGuard({ children, requirePerm }: { children: React.ReactNode; requirePerm?: string }) {
  const router = useRouter();
  const { me, loading, error } = useMe();

  useEffect(() => {
    if (loading) return;
    if (!getAccessToken()) router.push("/login");
  }, [loading, router]);

  if (loading) return <div className="p-10 text-text-muted">Loading…</div>;
  if (error) return <div className="p-10 text-status-errText">Auth error: {error}</div>;
  if (!me) return null;

  if (requirePerm) {
    const member = me.memberships.find((m) => m.organizationId === me.currentOrganizationId);
    if (!member?.permissions.includes(requirePerm)) {
      return <div className="p-10 text-status-errText">Missing permission: {requirePerm}</div>;
    }
  }

  return <>{children}</>;
}
