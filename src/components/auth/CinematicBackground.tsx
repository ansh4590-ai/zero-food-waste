/**
 * Reusable cinematic dark gradient background with ambient glow,
 * film grain, and floating decorative elements.
 * Pure CSS — no images, no 3D, no photos.
 */
export function CinematicBackground() {
  return (
    <>
      {/* ── Base Gradient Layer ── */}
      <div className="absolute inset-0 z-0 bg-background">
        {/* Primary radial gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(16,185,129,0.08)_0%,transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(20,184,166,0.06)_0%,transparent_45%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_90%,rgba(16,185,129,0.05)_0%,transparent_40%)]"></div>
        {/* Vignette */}
        <div className="absolute inset-0 hidden dark:block bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.5)_70%,rgba(0,0,0,0.9)_100%)]"></div>
        {/* Film Grain */}
        <div className="absolute inset-0 bg-noise opacity-[0.15] mix-blend-overlay pointer-events-none"></div>
      </div>

      {/* ── Floating Ambient Glow Blobs ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[5%] w-[40vw] h-[40vw] bg-emerald-500/[0.04] rounded-full blur-[150px] animate-blob"></div>
        <div className="absolute bottom-[5%] right-[10%] w-[35vw] h-[35vw] bg-teal-500/[0.03] rounded-full blur-[130px] animate-blob animation-delay-4000"></div>
      </div>

      {/* ── Decorative Grid Dots ── */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-[0.03]">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, var(--foreground) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}></div>
      </div>
    </>
  );
}
