import MergeWorkflow from "@/components/learn/video/merge-workflow";

export const dynamic = "force-dynamic";

export default function MergePage() {
  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">🎬 מיזוג קליפים</h1>
        <p className="text-sm text-slate-400 mt-1">
          העלה כמה קליפים, סדר אותם, הגדר טרנזישנים ואודיו, ולחץ &quot;מזג&quot; — תקבל סרטון אחד מאוחד.
        </p>
      </header>
      <MergeWorkflow />
    </div>
  );
}
