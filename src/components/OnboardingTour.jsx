// OnboardingTour — first-run guided tour overlay. Mounted in Layout, so
// it only ever renders for a signed-in user (Layout wraps the protected
// routes only — /login and /register never see it).
// One stop at a time, Next / Back, Skip anytime (top-right X). Finishing
// or skipping saves 'done' on-device (see src/lib/onboardingTour.js) so
// it never pops up again unless the user replays it from Settings.
// The tour is Free — no tier check anywhere in this file.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import {
  TOUR_STEPS,
  TOUR_START_EVENT,
  hasCompletedTour,
  markTourComplete,
} from '@/lib/onboardingTour';

export default function OnboardingTour() {
  const location = useLocation();
  const navigate = useNavigate();
  // null = hidden. A number = the step being shown.
  const [step, setStep] = useState(null);
  // AH-H10/AH-L11: where the tour started, so Skip/X can return there.
  const [returnTo, setReturnTo] = useState('/');

  // First run: open step 0 when the user lands on Home.
  useEffect(() => {
    if (step === null && location.pathname === '/' && !hasCompletedTour()) {
      setReturnTo('/');
      setStep(0);
    }
  }, [location.pathname, step]);

  // Replay: Settings -> "Take the tour again" fires this event.
  useEffect(() => {
    const start = () => {
      setReturnTo(location.pathname);
      if (location.pathname !== '/') navigate('/');
      setStep(0);
    };
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, [location.pathname, navigate]);

  if (step === null) return null;
  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  // AH-H10: only explicit Skip/Finish mark done. Finish goes Home;
  // Skip/X return to where the tour started (AH-L11) — replaying from
  // Settings must not dump the user on Home.
  const close = (goHome) => {
    markTourComplete();
    setStep(null);
    if (goHome) {
      if (location.pathname !== '/') navigate('/');
    } else if (returnTo && returnTo !== location.pathname) {
      navigate(returnTo);
    }
  };

  const goTo = (index) => {
    setStep(index);
    const route = TOUR_STEPS[index].route;
    if (route !== location.pathname) navigate(route);
  };

  return (
    <div
      role="dialog"
      aria-label={`Onboarding tour, step ${step + 1} of ${TOUR_STEPS.length}: ${current.title}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
    >
      {/* AH-H10: no onClick on the backdrop - a stray tap outside the
          sheet must not end the tour. Only Skip/Finish close it. */}
      <div
        className="safe-bottom w-full max-w-md rounded-t-3xl border border-border bg-zinc-950 p-5 pb-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
            Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button
            onClick={() => close(false)}
            aria-label="Skip tour"
            className="tap-target -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-1 flex gap-1.5" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-zinc-800'}`}
            />
          ))}
        </div>

        <h2 className="mt-4 font-display font-bold text-2xl leading-tight">
          {current.title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          {current.body}
        </p>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => goTo(step - 1)}
            disabled={isFirst}
            className="tap-target inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border font-display font-semibold uppercase tracking-wide text-sm disabled:opacity-40"
          >
            <ArrowLeft size={17} /> Back
          </button>
          <button
            onClick={() => (isLast ? close(true) : goTo(step + 1))}
            className="tap-target inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-primary font-display font-bold uppercase tracking-wide text-sm text-primary-foreground"
          >
            {isLast ? 'Start diagnosing' : 'Next'}
            {!isLast && <ArrowRight size={17} />}
          </button>
        </div>

        <button
          onClick={() => close(false)}
          className="tap-target mt-2 w-full text-center text-sm text-muted-foreground underline"
        >
          Skip the tour
        </button>
      </div>
    </div>
  );
}
