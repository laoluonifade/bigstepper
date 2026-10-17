import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

export default function MyChallenges() {
  const [created, setCreated] = useState<any[]>([]);
  const [joined, setJoined] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: c } = await supabase.from('challenges').select('*').eq('creator_id', user.id);
    setCreated(c || []);

    const { data: p } = await supabase.from('participants').select('challenges(*)').eq('user_id', user.id);
    setJoined(p?.map((x: any) => x.challenges) || []);
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">My Challenges</h1>
      <h2 className="text-lg font-semibold mb-2">Created</h2>
      {created.map(c => <Link key={c.id} to={`/c/${c.code}`} className="card block mb-2">{c.title}</Link>)}
      <h2 className="text-lg font-semibold mt-4 mb-2">Joined</h2>
      {joined.map(c => <Link key={c.id} to={`/c/${c.code}`} className="card block mb-2">{c.title}</Link>)}
    </div>
  );
}
