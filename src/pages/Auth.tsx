import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
      else navigate('/');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert(error.message);
      } else if (data.user) {
        await supabase.from('profiles').insert({ id: data.user.id, display_name: displayName || email.split('@')[0] });
        alert('Check your email for confirmation!');
      }
    }
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-6 text-center">Big Stepper</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <input
            type="text"
            placeholder="Display name"
            className="w-full p-3 rounded-lg bg-slate-800"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          required
          className="w-full p-3 rounded-lg bg-slate-800"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          required
          className="w-full p-3 rounded-lg bg-slate-800"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Loading...' : isLogin ? 'Log In' : 'Sign Up'}
        </button>
      </form>
      <button onClick={() => setIsLogin(!isLogin)} className="mt-4 text-sm text-emerald-400 w-full text-center">
        {isLogin ? 'Need an account? Sign up' : 'Already have an account? Log in'}
      </button>
    </div>
  );
}
