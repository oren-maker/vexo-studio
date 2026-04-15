import TrimWorkflow from "@/components/learn/video/trim-workflow";

export const dynamic = "force-dynamic";

export default function TrimPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">✂️ טרים מתקדם</h1>
        <p className="text-sm text-slate-400 mt-1">
          העלה סרטון ⇒ FFmpeg.wasm יזהה את כל הסצנות ⇒ Gemini Flash מדרג כל סצנה לפי עניין ויזואלי ⇒ בחר את הסצנות הטובות ⇒ ייצא לפרויקט מיזוג.
        </p>
      </header>
      <TrimWorkflow />
    </div>
  );
}
