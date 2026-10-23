import type { Gender } from '../lib/types';

export function GenderSelect({ value, onChange, id }: { value: Gender | ''; onChange: (value: Gender | '') => void; id?: string }) {
  return <select id={id} className="field" value={value} onChange={(event) => onChange(event.target.value as Gender | '')}>
    <option value="">Choose later</option>
    <option value="male">Male</option>
    <option value="female">Female</option>
    <option value="non_binary">Non-binary</option>
    <option value="prefer_not_to_say">Prefer not to say</option>
  </select>;
}
