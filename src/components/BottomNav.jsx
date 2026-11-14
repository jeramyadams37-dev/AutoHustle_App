import { NavLink } from 'react-router-dom';
import { Home, PlusCircle, Wrench, SearchCode, Bluetooth, Truck } from 'lucide-react';

const items = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/new', label: 'New', icon: PlusCircle },
  { to: '/scan', label: 'Scan', icon: Bluetooth },
  { to: '/garage', label: 'Garage', icon: Wrench },
  { to: '/fleet', label: 'Owner Fleet', icon: Truck },
  { to: '/codes', label: 'Codes', icon: SearchCode },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-zinc-950/95 backdrop-blur safe-bottom">
      <div className="mx-auto max-w-md grid grid-cols-6">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tap-target flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* AH-L10: active tab gets a pill behind the icon as well
                    as the colour change, so it is not colour-only. */}
                <span className={`flex items-center justify-center rounded-full px-2.5 py-1 ${isActive ? 'bg-primary/15' : ''}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className={`font-display uppercase tracking-wide whitespace-nowrap ${isActive ? 'font-bold' : ''}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
