import { NavLink } from 'react-router-dom';
import { Home, PlusCircle, Wrench, SearchCode } from 'lucide-react';

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/new', label: 'New Ticket', icon: PlusCircle },
  { to: '/garage', label: 'Garage', icon: Wrench },
  { to: '/codes', label: 'Codes', icon: SearchCode },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-zinc-950/95 backdrop-blur safe-bottom">
      <div className="mx-auto max-w-md grid grid-cols-4">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tap-target flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                <span className="font-display uppercase tracking-wide">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
