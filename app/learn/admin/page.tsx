"use client";

import { useState, useEffect } from "react";

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = localStorage.getItem("adminKey") || "";
    setKey(existing);
  }, []);

  function save() {
    if (!key.trim()) {
      localStorage.removeItem("adminKey");
    } else {
      localStorage.setItem("adminKey", key.trim());
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-xl mx-auto mt-12">
      <h1 className="text-2xl font-bold text-white mb-2">🔑 הגדרת מפתח מנהל</h1>
      <p className="text-sm text-slate-400 mb-6">
        כל הפעולות שמוציאות כסף (Auto-Improve, Snapshot, יצירת וידאו/תמונה, מחיקה) דורשות את המפתח.
        הזן את הערך של <code className="bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300">ADMIN_API_KEY</code> ש-Vercel מכיר.
        המפתח נשמר מקומית בדפדפן בלבד.
      </p>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm text-slate-300 mb-2">Admin API Key</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            dir="ltr"
            placeholder="ADMIN_API_KEY..."
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2 rounded-lg text-sm"
          >
            {saved ? "✓ נשמר" : "שמור"}
          </button>
          {key && (
            <button
              onClick={() => { setKey(""); localStorage.removeItem("adminKey"); setSaved(true); setTimeout(() => setSaved(false), 1500); }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              מחק מפתח
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 text-[11px] text-slate-500 leading-relaxed">
        <b>איך זה עובד:</b> ב-Vercel Environment Variables, הגדר <code className="text-cyan-300">ADMIN_API_KEY</code> לערך אקראי חזק (למשל <code className="text-cyan-300">openssl rand -hex 32</code>). הזן אותו כאן. הדפדפן יצרף <code className="text-cyan-300">x-admin-key</code> בכל קריאה לנקודות רגישות. ללא המפתח — הקריאות יחזירו 401.
      </div>
    </div>
  );
}
