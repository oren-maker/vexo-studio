export default function OnboardingPage() {
  return (
    <main className="min-h-screen grid place-items-center" style={{ background: "var(--sidebar-bg-gradient)" }}>
      <div className="bg-bg-card rounded-card shadow-card p-8 w-[480px]">
        <h1 className="text-2xl font-bold mb-1">Welcome to VEXO Studio</h1>
        <p className="text-text-secondary text-sm mb-6">Set up your organization in three steps.</p>
        <ol className="list-decimal pl-5 space-y-2 text-sm mb-6">
          <li>Name your organization and choose a plan</li>
          <li>Configure your first AI provider + budget</li>
          <li>Create your first project from a template</li>
        </ol>
        <button className="w-full py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent-light">Get started</button>
      </div>
    </main>
  );
}
