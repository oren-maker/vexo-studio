import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/page-shell";

export default function ProjectsPage() {
  return (
    <div className="p-6">
      <PageHeader title="Projects" action={<Link href="/projects/new" className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">New project</Link>} />
      <Card title="All projects" subtitle="Series, courses and kids content">
        <EmptyState icon="🎬" title="No projects yet" body="Start with a template or create from scratch." action={<Link href="/projects/new" className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Create project</Link>} />
      </Card>
    </div>
  );
}
