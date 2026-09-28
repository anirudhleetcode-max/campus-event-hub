"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#64748b" }}>Please refresh the page or try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
