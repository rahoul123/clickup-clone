import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const resetToken = searchParams.get('token');
  const fromEmailLink = Boolean(uid?.trim() && resetToken?.trim());

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (fromEmailLink && uid && resetToken) {
        await api.auth.completePasswordReset({ uid, token: resetToken, password });
      } else {
        await api.auth.resetPassword(password);
      }
      navigate('/login');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center overflow-y-auto bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">Set new password</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {fromEmailLink
            ? 'Choose a password for your account.'
            : 'Change your password while signed in (requires an active session).'}
        </p>
        {!fromEmailLink && (
          <p className="text-xs text-muted-foreground text-center mb-4 rounded-lg bg-muted/50 px-3 py-2">
            Resetting from email? Use the link from your inbox — it opens this page with a token in the URL.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="New password"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link to="/login" className="text-primary hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
