import { useEffect, useState } from 'react';

interface UpdateInfo {
  version: string;
}

declare global {
  interface Window {
    digitech?: {
      isDesktop?: boolean;
      onUpdateReady?: (callback: (info: UpdateInfo) => void) => void;
      installUpdate?: () => void;
      dismissUpdate?: () => void;
    };
  }
}

export function UpdateDialog() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (!window.digitech?.onUpdateReady) return;
    window.digitech.onUpdateReady((info: UpdateInfo) => {
      setUpdateInfo(info);
    });
  }, []);

  if (!updateInfo) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 999999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(24px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        .update-card { animation: slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .btn-install { transition: opacity 0.2s, transform 0.15s !important; }
        .btn-install:hover { opacity: 0.88 !important; transform: translateY(-1px) !important; }
        .btn-later:hover { background: rgba(255,255,255,0.07) !important; color: rgba(255,255,255,0.85) !important; }
      `}</style>

      <div className="update-card" style={{
        background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px',
        padding: '40px 36px 32px',
        width: '400px',
        maxWidth: '90vw',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
        textAlign: 'center',
        color: 'white',
      }}>
        {/* Icon */}
        <div style={{
          width: '72px', height: '72px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '32px',
          boxShadow: '0 12px 32px rgba(102,126,234,0.45)',
        }}>🚀</div>

        {/* Title */}
        <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 10px', color: '#fff' }}>
          Update Ready!
        </h2>

        {/* Version badge */}
        <div style={{
          display: 'inline-block',
          background: 'rgba(102,126,234,0.18)',
          border: '1px solid rgba(102,126,234,0.4)',
          color: '#a78bfa', fontSize: '12px', fontWeight: 600,
          padding: '4px 14px', borderRadius: '999px',
          marginBottom: '16px', letterSpacing: '0.5px',
        }}>
          v{updateInfo.version}
        </div>

        {/* Description */}
        <p style={{
          fontSize: '14px', color: 'rgba(255,255,255,0.55)',
          margin: '0 0 32px', lineHeight: 1.6,
        }}>
          A new version of{' '}
          <strong style={{ color: 'rgba(255,255,255,0.85)' }}>DigitechIO</strong>{' '}
          is ready. Save your work and restart to enjoy the latest features.
        </p>

        {/* Install Button */}
        <button className="btn-install" onClick={() => {
          setUpdateInfo(null);
          window.digitech?.installUpdate?.();
        }} style={{
          width: '100%', padding: '14px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none', borderRadius: '14px',
          color: 'white', fontSize: '15px', fontWeight: 600,
          cursor: 'pointer', marginBottom: '10px',
          boxShadow: '0 6px 20px rgba(102,126,234,0.4)',
        }}>
          ⚡ Restart & Install Now
        </button>

        {/* Later Button */}
        <button className="btn-later" onClick={() => {
          setUpdateInfo(null);
          window.digitech?.dismissUpdate?.();
        }} style={{
          width: '100%', padding: '12px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '14px',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '13px', cursor: 'pointer',
          transition: 'all 0.2s',
        }}>
          Remind me in 30 minutes
        </button>
      </div>
    </div>
  );
}