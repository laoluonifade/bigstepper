import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function CreateChallenge() {
  const [title, setTitle] = useState('');
  const [activityType, setActivityType] = useState('walking');
  const [entryFee, setEntryFee] = useState(0);
  const [visibility, setVisibility] = useState('public');
  const [scoring, setScoring] = useState('steps');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase.from('challenges').insert({
      title,
      activity_type: activityType,
      entry_fee_ngn: entryFee,
      visibility,
      scoring_method: scoring,
      code,
      creator_id: user.id,
      status: 'upcoming'
    }).select().single();

    if (error) {
      alert(error.message);
    } else {
      navigate(`/c/${data.code}`);
    }
    setLoading(false);
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Create Challenge</h1>
      <form onSubmit={handleCreate} className="space-y-4">
        <input required placeholder="Challenge name" className="w-full p-3 rounded-lg bg-slate-800" value={title} onChange={e => setTitle(e.target.value)} />
        <select className="w-full p-3 rounded-lg bg-slate-800" value={activityType} onChange={e => setActivityType(e.target.value)}>
          <option value="walking">Walking</option>
          <option value="running">Running</option>
          <option value="both">Both</option>
        </select>
        <input type="number" min="0" placeholder="Entry fee (NGN)" className="w-full p-3 rounded-lg bg-slate-800" value={entryFee} onChange={e => setEntryFee(Number(e.target.value))} />
        <select className="w-full p-3 rounded-lg bg-slate-800" value={visibility} onChange={e => setVisibility(e.target.value)}>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <select className="w-full p-3 rounded-lg bg-slate-800" value={scoring} onChange={e => setScoring(e.target.value)}>
          <option value="steps">Highest steps</option>
          <option value="distance">Highest distance</option>
        </select>
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Creating...' : 'Publish Challenge'}
        </button>
      </form>
    </div>
  );
}
