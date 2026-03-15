import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api/auth';

function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Verify token with backend
      fetch(`${API_BASE}/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (res.ok) {
            navigate('/chat');
          } else {
            localStorage.removeItem('auth_token');
            setLoading(false);
          }
        })
        .catch(() => {
          localStorage.removeItem('auth_token');
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [navigate]);

  // Handle Google OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      setLoading(true);
      // Exchange code for token
      fetch(`${API_BASE}/google/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
        .then(res => res.json())
        .then(data => {
          if (data.token) {
            localStorage.setItem('auth_token', data.token);
            navigate('/chat');
          } else {
            setError(data.error || 'Authentication failed');
            setLoading(false);
          }
        })
        .catch(err => {
          setError('Failed to authenticate with Google');
          setLoading(false);
        });
    }
  }, [navigate]);

  const handleGoogleLogin = async () => {
    try {
      // Get Google OAuth URL from backend
      const res = await fetch(`${API_BASE}/google/url`);
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Failed to get Google login URL');
      }
    } catch (err) {
      setError('Failed to initialize Google login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 flex items-center gap-2">
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">System Monitor</h1>
          <p className="text-slate-400">Claude Remote Chat</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 sm:p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">Sign in to continue</h2>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 font-medium py-3 px-4 rounded-lg transition-colors shadow-sm border border-gray-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Sign in with Google</span>
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800 text-slate-500">Secure authentication</span>
            </div>
          </div>

          {/* Info */}
          <p className="text-center text-xs text-slate-500">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Need help? Contact your administrator</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
