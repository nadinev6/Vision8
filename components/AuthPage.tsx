import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Safari } from './ui/safari';
import { toast } from './ui/toaster';

interface AuthPageProps {
    onBack: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onBack }) => {
    const { login, register, resetPassword } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setMessage('');

        try {
            if (isForgotPassword) {
                const result = await resetPassword(email);
                if (result.success) {
                    setMessage(result.message);
                    toast.success('Email sent', {
                        description: 'Check your inbox for the reset link.',
                    });
                } else {
                    setError(result.message);
                    toast.error('Reset failed', {
                        description: result.message,
                    });
                }
            } else {
                let success;
                if (isLogin) {
                    success = await login({ email, password });
                    if (success) {
                        toast.success('Welcome back!', {
                            description: 'You have successfully signed in.',
                        });
                    }
                } else {
                    success = await register({ name, email, password });
                    if (success) {
                        toast.success('Account created!', {
                            description: 'Welcome to Vision8.',
                        });
                    }
                }

                if (!success) {
                    setError(isLogin ? 'Invalid credentials.' : 'Registration failed.');
                    toast.error(isLogin ? 'Login failed' : 'Registration failed', {
                        description: isLogin ? 'Please check your email and password.' : 'Unable to create account.',
                    });
                }
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-black text-white overflow-hidden">
            {/* Left Side - Visuals (Hidden on mobile) */}
            <div className="hidden lg:flex w-1/2 relative bg-gray-900 items-center justify-center p-12 overflow-hidden">
                {/* Background Effect */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="w-full h-full"
                        style={{
                            backgroundImage: `repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(255,255,255,0.03) 2px,
                    rgba(255,255,255,0.03) 4px
                )`
                        }} />
                </div>

                {/* Decorative elements */}
                <div className="absolute top-0 right-0 p-8 opacity-50">
                    <div className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-transparent opacity-10 select-none">
                        VISION 8
                    </div>
                </div>

                <div className="relative w-full max-w-lg z-10">
                    <div className="relative rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 shadow-2xl p-2 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                        <Safari
                            url="https://vision8-preview.app"
                            videoSrc="/src/preview.mp4"
                            className="w-full h-auto rounded shadow-lg"
                        />
                    </div>
                    <div className="mt-8 text-center">
                        <h2 className="text-3xl font-bold mb-4 text-white">
                            {isForgotPassword ? "Reset Password" : (isLogin ? "Welcome Back" : "Join the Future")}
                        </h2>
                        <p className="text-gray-400 max-w-md mx-auto">
                            {isLogin
                                ? "Continue your journey into video intelligence. Access your scenes, analysis, and insights."
                                : "Experience the next generation of video understanding. Sign up to get started."}
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 relative">
                <button
                    onClick={onBack}
                    className="absolute top-8 left-8 text-sm text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    Back to Home
                </button>

                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold tracking-tight mb-2">
                            {isForgotPassword ? 'Reset Password' : (isLogin ? 'Sign In' : 'Create Account')}
                        </h1>
                        <p className="text-gray-400">
                            {isForgotPassword
                                ? "Enter your email and we'll send you a reset link"
                                : (isLogin ? "Enter your details to access your account" : "Enter your details to create your account")}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
                                {error}
                            </div>
                        )}

                        {message && (
                            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm text-center">
                                {message}
                            </div>
                        )}

                        {!isLogin && !isForgotPassword && (
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="Full Name"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-300">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                placeholder="name@example.com"
                            />
                        </div>

                        {!isForgotPassword && (
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        )}

                        {isLogin && !isForgotPassword && (
                            <div className="text-right">
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(true); setError(''); setMessage(''); }}
                                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                </span>
                            ) : (
                                isForgotPassword ? 'Send Reset Link' : (isLogin ? 'Sign In' : 'Create Account')
                            )}
                        </button>
                    </form>

                    <div className="text-center pt-4">
                        {isForgotPassword ? (
                            <p className="text-sm text-gray-400">
                                Remember your password?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(false); setError(''); setMessage(''); }}
                                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                >
                                    Sign in
                                </button>
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400">
                                {isLogin ? "Don't have an account? " : "Already have an account? "}
                                <button
                                    type="button"
                                    onClick={() => setIsLogin(!isLogin)}
                                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                >
                                    {isLogin ? 'Sign up' : 'Sign in'}
                                </button>
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
