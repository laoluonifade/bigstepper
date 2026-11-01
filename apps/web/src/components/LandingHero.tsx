import { Link } from '@tanstack/react-router';
const TESTFLIGHT = 'https://testflight.apple.com/join/FTERY15d';
export function LandingHero() {
  return (
    <section className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center py-12 sm:py-16">
      {/* As big as the screen allows: "COMPETE.", the widest line, is 6.44× the font size, inside 16px gutters. */}
      <h1 className="display text-[min(calc((100vw_-_32px)/6.5),124px)] leading-[0.86] tracking-[-0.055em]">
        <span className="reveal-line">
          <span>Move.</span>
        </span>
        <span className="reveal-line">
          <span className="[animation-delay:90ms]">Compete.</span>
        </span>
        <span className="reveal-line">
          <span className="whitespace-nowrap [animation-delay:180ms]">
            {/* A lemon highlight sweeps in behind "Win" once the lines are up, then the full stop pops. */}
            <span className="relative inline-block px-[0.06em]">
              <span
                className="absolute inset-x-0 bottom-[0.06em] top-[0.12em] -z-10 origin-left animate-grow-x bg-volt [animation-delay:620ms]"
                aria-hidden="true"
              />
              Win
            </span>
            <span className="inline-block animate-pop text-track [animation-delay:1100ms]">
              .
            </span>
          </span>
        </span>
      </h1>
      <p className="mt-7 max-w-xl animate-rise-lg text-[18px] leading-relaxed text-ink-2 [animation-delay:350ms] sm:text-[21px]">
        Turn your everyday walks, runs and rides into a race. Compete with
        friends, clubs and your city, climb the leaderboard, and win real
        prizes.
      </p>
      <div className="mt-8 flex w-full max-w-md animate-rise-lg flex-col gap-3 [animation-delay:480ms] sm:max-w-none sm:flex-row sm:justify-center">
        {/* The app is the point: the main button gets runners onto the iPhone beta. */}
        <a
          href={TESTFLIGHT}
          target="_blank"
          rel="noreferrer"
          className="btn-primary min-h-12 px-6"
        >
          <svg
            className="-mt-0.5 shrink-0"
            viewBox="0 0 384 512"
            width="15"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          </svg>
          Download iOS beta
        </a>
        <Link to="/competitions" className="btn-secondary min-h-12 px-6">
          Explore
        </Link>
      </div>
      <Link
        to="/business"
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink hover:decoration-track"
      >
        For businesses <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
