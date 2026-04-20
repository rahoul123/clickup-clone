import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="relative min-h-full overflow-y-auto bg-background px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-[-90px] h-72 w-72 -translate-x-1/2 rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-700/20" />
      <div className="pointer-events-none absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-700/15" />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle variant="menu" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="w-full rounded-2xl border border-border bg-card p-7 shadow-xl sm:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-48 items-center justify-center rounded-xl bg-slate-900 px-4 shadow-lg shadow-slate-900/30 dark:bg-slate-950 dark:shadow-slate-950/50">
              <img
                src="/logo-digitechio.png"
                alt="DigitechIO"
                className="h-8 w-auto max-w-full object-contain"
              />
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">DigitechIO Workspace</p>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to continue managing your team work</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs font-medium text-violet-600 transition-opacity hover:opacity-80 dark:text-violet-400">Forgot password?</Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:-translate-y-0.5 hover:bg-violet-700 disabled:translate-y-0 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-violet-600 transition-opacity hover:opacity-80 dark:text-violet-400">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
