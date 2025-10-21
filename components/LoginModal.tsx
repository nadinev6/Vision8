import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginModal: React.FC = () => {

  const { login, hideLogin, isLoginVisible } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const success = await login({ email, password });
      if (!success) {
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    hideLogin();
    setEmail('');
    setPassword('');
    setError('');
  };

  if (!isLoginVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Retro-futuristic Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{
          background: 'rgba(90, 122, 122, 0.3)',
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255,255,255,0.02) 2px,
            rgba(255,255,255,0.02) 4px
          )`
        }}
        onClick={handleClose}
      />

      {/* Modal with White Transparency */}
      <div
        className="relative w-full max-w-md mx-4 p-8 rounded-2xl shadow-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
        }}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 transition-all duration-200 hover:scale-110"
          style={{
            color: 'rgba(255, 255, 255, 0.6)',
            filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.3))'
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2 text-foreground">
            Welcome to Vision 8
          </h2>
          <p className="text-muted-foreground">
            Sign in to access your video intelligence platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ff6b6b',
                backdropFilter: 'blur(10px)'
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-2 text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg focus:outline-none transition-all duration-200 bg-white/50 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-2 text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg focus:outline-none transition-all duration-200 bg-white/50 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02] focus:outline-none"
            style={{
              background: 'oklch(0.71 0.17 22.22)',
              color: '#ffffff',
              opacity: isLoading ? 0.7 : 1,
              boxShadow: `
                0 4px 15px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.2)
              `,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                <span>Signing in...</span>
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Demo Notice */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border/50">
          <p className="text-xs text-center text-muted-foreground">
            <strong>Demo Mode:</strong> Use any email and password to sign in
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{' '}
            <button className="hover:underline font-medium transition-colors duration-200 text-primary hover:text-primary/80">
              Contact us for access
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;