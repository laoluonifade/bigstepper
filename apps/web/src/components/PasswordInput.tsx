import { useState, type InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon } from './icons';
import { cx } from './ui';

/** A password field with an eye to show what's been typed. */
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? 'text' : 'password'} className={cx(className, 'pr-11')} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-2 hover:text-ink"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        {shown ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}
