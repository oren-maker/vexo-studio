export default function TwoFactorPage() {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main max-w-2xl">
      <h2 className="text-lg font-semibold mb-1">Two-Factor Authentication</h2>
      <p className="text-text-secondary text-sm mb-6">
        Adds a one-time code from an authenticator app (e.g. 1Password, Google Authenticator) to your sign-in.
      </p>
      <div className="rounded-lg bg-status-warningBg/50 border border-status-warnText/30 p-4 mb-6 text-sm" style={{ background: "#fff8e6" }}>
        <strong>Required for ADMIN and SUPER_ADMIN.</strong> You won't be able to access privileged routes without enabling 2FA.
      </div>
      <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-light">
        Set up 2FA
      </button>
    </div>
  );
}
