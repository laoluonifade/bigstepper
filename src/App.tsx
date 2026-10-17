import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Discover from './pages/Discover';
import MyChallenges from './pages/MyChallenges';
import CreateChallenge from './pages/CreateChallenge';
import Profile from './pages/Profile';
import ChallengeDetail from './pages/ChallengeDetail';
import Auth from './pages/Auth';

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen pb-16">
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/c/:code" element={<ChallengeDetail />} />
          <Route path="/my" element={user ? <MyChallenges /> : <Navigate to="/auth" />} />
          <Route path="/create" element={user ? <CreateChallenge /> : <Navigate to="/auth" />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/auth" />} />
          <Route path="/auth" element={<Auth />} />
        </Routes>

        {user && (
          <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 flex justify-around py-3">
            <a href="/" className="text-center text-sm">Discover</a>
            <a href="/my" className="text-center text-sm">My</a>
            <a href="/create" className="text-center text-sm">Create</a>
            <a href="/profile" className="text-center text-sm">Profile</a>
          </nav>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;
