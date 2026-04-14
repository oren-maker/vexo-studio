"use client";
import { useState } from "react";

export default function NewProjectPage() {
  const [name, setName] = useState("");
  const [contentType, setContentType] = useState<"SERIES" | "COURSE" | "KIDS_CONTENT">("SERIES");

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">New Project</h1>
      <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Content type</label>
          <select value={contentType} onChange={(e) => setContentType(e.target.value as never)} className="w-full px-3 py-2 rounded-lg border border-bg-main">
            <option value="SERIES">TV Series</option>
            <option value="COURSE">Training Course</option>
            <option value="KIDS_CONTENT">Kids Content</option>
          </select>
        </div>
        <button className="px-4 py-2 rounded-lg bg-accent text-white font-semibold">Create</button>
      </div>
    </div>
  );
}
