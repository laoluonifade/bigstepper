import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const navigate = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Profile</h1>
      <p className="mb-4">Activity history, payments, and payouts will appear here.</p>
      <button onClick={logout} className="btn bg-red-600 hover:bg-red-700 text-white">Log Out</button>
    </div>
  );
}
