import { redirect } from "next/navigation";

// Canonical episode page is /episodes/[id]. This nested URL exists so the
// bubble's pageContext regex /seasons/.../episodes/.../ matches and the
// brain can emit nested paths. Redirect to the flat route.
export default function EpisodeNestedPage({ params }: { params: { episodeId: string } }) {
  redirect(`/episodes/${params.episodeId}`);
}
