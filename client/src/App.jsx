import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import CpuMonitor from './pages/CpuMonitor';
import ClaudeRemoteMonitor from './pages/ClaudeRemoteMonitor';
import RecoveryLogs from './pages/RecoveryLogs';
import ChatPage from './pages/ChatPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900 p-2 sm:p-4 md:p-6">
        <Navigation />
        <Routes>
          <Route path="/" element={<CpuMonitor />} />
          <Route path="/claude-remote" element={<ClaudeRemoteMonitor />} />
          <Route path="/logs" element={<RecoveryLogs />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
