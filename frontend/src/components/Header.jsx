import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home' },
  { to: '/booking', label: 'Booking' },
  { to: '/dashboard', label: 'Dashboard' }
];

const Header = () => {
  return (
    <header className="bg-white/80 shadow-sm backdrop-blur px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <span className="rounded-full bg-brand-primary/10 px-2 py-1 text-sm font-bold text-brand-primary">IoT</span>
          Parqeer Valet
        </div>
        <nav className="flex gap-4 text-sm font-medium text-slate-600">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${isActive ? 'bg-brand-primary text-white' : 'hover:text-brand-primary'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
