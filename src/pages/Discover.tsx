import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export default function Discover() {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchChallenges();
  }, [filter]);

  async function fetchChallenges() {
    let query = supabase.from('challenges').select('*, profiles(display_name)').eq('visibility', 'public');

    if (filter === 'walking') query = query.eq('activity_type', 'walking');
    if (filter === 'running') query = query.eq('activity_type', 'running');
    if (filter === 'both') query = query.eq('activity_type', 'both');

    const { data } = await query.order('created_at', { ascending: false });
    setChallenges(data || []);
  }

  const filtered = challenges.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-2">Discover Challenges</h1>
      <p className="text-slate-400 mb-4">Walk more. Climb higher.</p>

      <input
        type="text"
        placeholder="Search challenges..."
        className="w-full p-3 rounded-lg bg-slate-800 mb-4"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {['all', 'walking', 'running', 'both'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm ${filter === f ? 'bg-emerald-500' : 'bg-slate-700'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(c => (
          <Link key={c.id} to={`/c/${c.code}`} className="card block">
            <h2 className="font-bold text-lg">{c.title}</h2>
            <p className="text-sm text-slate-400">by {c.profiles?.display_name || 'Unknown'}</p>
            <div className="flex justify-between mt-2 text-sm">
              <span>{c.activity_type}</span>
              <span>₦{c.entry_fee_ngn}</span>
              <span>{c.participant_count || 0} joined</span>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-center text-slate-500">No challenges yet. Be the first to create one!</p>}
      </div>
    </div>
  );
}
