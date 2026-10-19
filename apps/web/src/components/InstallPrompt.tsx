import { useEffect, useState } from 'react';
import { useStored } from '../lib/local';
import { CloseIcon, ShareIcon, StepMark } from './icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'jump_install_dismissed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Invites runners to add Jump to their home screen. Chrome/Android/desktop get a one-tap install;
 * iOS has no install API, so it shows the Share → Add to Home Screen steps instead.
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useStored<boolean>(DISMISS_KEY, false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const ios = isIos();
  if (installed || dismissed || (!deferred && !ios)) return null;

  return (
    <div className="animate-rise mb-6 flex items-start gap-4 rounded-md border-[1.5px] border-ink bg-card p-4">
      <StepMark size={44} className="shrink-0 animate-pop rounded-[9px]" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold">Add Jump to your home screen</p>
        {deferred ? (
          <>
            <p className="mt-0.5 text-[13px] text-ink-2">Open it like an app and start runs in one tap.</p>
            <button
              type="button"
              className="btn-primary btn-sm mt-3"
              onClick={async () => {
                await deferred.prompt();
                const choice = await deferred.userChoice;
                setDeferred(null);
                if (choice.outcome === 'accepted') setInstalled(true);
              }}
            >
              Install Jump
            </button>
          </>
        ) : (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
            In Safari, tap <ShareIcon size={14} className="mx-0.5 inline -translate-y-px" aria-label="Share" /> Share, then{' '}
            <span className="font-semibold text-ink">Add to Home Screen</span>.
          </p>
        )}
      </div>
      <button type="button" className="rounded p-1.5 text-ink-3 hover:bg-ink/[0.06] hover:text-ink" aria-label="Dismiss" onClick={() => setDismissed(true)}>
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
