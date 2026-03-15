import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

const API_BASE = '/api/auth';

function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');

    if (!token) {
      setLoading(false);
      setAuthenticated(false);
      return;
    }

    // Verify token with backend
    fetch(`${API_BASE}/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) {
          setAuthenticated(true);
        } else {
          localStorage.removeItem('auth_token');
          setAuthenticated(false);
        }
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem('auth_token');
        setAuthenticated(false);
        setLoading(false);
      });
  }, []);

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

  return authenticated ? children : <Navigate to="/login" replace />;
}

export default ProtectedRoute;
