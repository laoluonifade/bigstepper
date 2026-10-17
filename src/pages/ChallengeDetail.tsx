import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ChallengeDetail() {
  const { code } = useParams();
  const [challenge, setChallenge] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [steps, setSteps] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadChallenge();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [code]);

  async function loadChallenge() {
    const { data } = await supabase.from('challenges').select('*, profiles(display_name)').eq('code', code).single();
    setChallenge(data);

    if (data) {
      const { data: parts } = await supabase.from('participants').select('*, profiles(display_name)').eq('challenge_id', data.id);
      setParticipants(parts || []);
    }
  }

  async function joinChallenge() {
    if (!user) {
      navigate('/auth');
      return;
    }
    const { error } = await supabase.from('participants').insert({ challenge_id: challenge.id, user_id: user.id });
    if (error) alert(error.message);
    else loadChallenge();
  }

  async function submitSteps() {
    if (!user || !steps) return;
    await supabase.from('activities').insert({
      challenge_id: challenge.id,
      user_id: user.id,
      steps: Number(steps)
    });
    setSteps('');
    alert('Steps submitted!');
  }

  if (!challenge) return <div className="p-4">Loading challenge...</div>;

  const isJoined = participants.some(p => p.user_id === user?.id);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{challenge.title}</h1>
      <p className="text-slate-400">by {challenge.profiles?.display_name}</p>
      <div className="card mt-4">
        <p>Type: {challenge.activity_type}</p>
        <p>Entry: ₦{challenge.entry_fee_ngn}</p>
        <p>Scoring: {challenge.scoring_method}</p>
        <p>Participants: {participants.length}</p>
      </div>

      {!isJoined && (
        <button onClick={joinChallenge} className="btn btn-primary w-full mt-4">
          Join Challenge
        </button>
      )}

      {isJoined && (
        <div className="mt-4">
          <input
            type="number"
            placeholder="Steps today"
            className="w-full p-3 rounded-lg bg-slate-800 mb-2"
            value={steps}
            onChange={e => setSteps(e.target.value)}
          />
          <button onClick={submitSteps} className="btn btn-primary w-full">Submit Steps</button>
        </div>
      )}

      <h2 className="text-xl font-bold mt-6 mb-2">Leaderboard</h2>
      <div className="space-y-2">
        {participants.map((p, i) => (
          <div key={p.id} className="card flex justify-between">
            <span>#{i + 1} {p.profiles?.display_name}</span>
            <span>Joined</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-slate-500">Share link: {window.location.href}</p>
    </div>
  );
}
