import { Card, EmptyState } from "@/components/page-shell";
export default function Page() {
  return (
    <div className="p-6">
      <Card title="Templates" subtitle="Marketplace + your saved templates">
        <EmptyState icon="✨" title="Coming together" body="This screen is part of the v2 spec — wiring to API in upcoming iterations." />
      </Card>
    </div>
  );
}
