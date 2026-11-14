import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import OnboardingTour from './OnboardingTour';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background grain">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <OnboardingTour />
      <BottomNav />
    </div>
  );
}
