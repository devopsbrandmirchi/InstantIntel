import React from 'react';

/**
 * Full-page loader shown while auth/session is resolving (e.g. direct URL refresh).
 * Corporate look: branded panel on subtle gradient background.
 */
const AppLoadingScreen = ({ message = 'Loading your workspace…' }) => {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0f2137 0%, #1e3a5f 38%, #152a45 72%, #0f172a 100%)'
      }}
    >
      {/* Soft accent orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-amber-500/8 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-sky-500/6 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-md shadow-2xl shadow-black/20 px-8 py-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-400/25">
              <i className="fas fa-building text-2xl text-amber-400/95" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Instant Intel</h1>
          <p className="text-sm text-white/55 mb-8">Business intelligence dashboard</p>

          <div className="flex flex-col items-center gap-4">
            <div
              className="h-11 w-11 rounded-full border-2 border-white/20 border-t-amber-400 animate-spin"
              role="status"
              aria-label="Loading"
            />
            <p className="text-sm text-white/70 font-medium">{message}</p>
            <p className="text-xs text-white/40">Please wait while we secure your session</p>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/30 mt-6">© {new Date().getFullYear()} Instant Intel</p>
      </div>
    </div>
  );
};

export default AppLoadingScreen;
