import { Card, EmptyState } from "@/components/page-shell";
export default function Page() {
  return (
    <div className="p-6">
      <Card title="A/B Thumbnails" subtitle="Test variants and pick the winner">
        <EmptyState icon="✨" title="Coming together" body="This screen is part of the v2 spec — wiring to API in upcoming iterations." />
      </Card>
    </div>
  );
}
