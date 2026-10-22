/** Shown instead of the app when required VITE_* variables are missing, so a misconfigured deploy explains itself. */
export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">PaySasa isn't configured yet</h1>
      <p className="mt-2 text-muted">These environment variables are missing from this build:</p>
      <ul className="mt-3 list-disc pl-6 font-mono text-[13px]">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <p className="mt-3 text-muted">
        Copy <code>frontend/.env.example</code> to <code>frontend/.env</code>, fill in the values, then restart or rebuild.
      </p>
    </main>
  );
}
