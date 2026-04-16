import { redirect } from "next/navigation";

// The canonical scene page lives at /scenes/[id]. The brain and bubble
// page-context emit the nested /seasons/.../episodes/.../scenes/<id> path
// so we have a matching URL shape for context detection. Redirect here
// so the nested URL actually works.
export default function SceneNestedPage({ params }: { params: { sceneId: string } }) {
  redirect(`/scenes/${params.sceneId}`);
}
