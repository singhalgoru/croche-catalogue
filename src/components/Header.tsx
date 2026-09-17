import Logo from './Logo';

export default function Header() {
  return (
    <header className="bg-rose-100/70 border-b border-rose-200">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col items-center text-center gap-2">
        <Logo />
        <h1 className="text-3xl md:text-4xl font-semibold text-rose-900">Luvia</h1>
        <p className="text-rose-700 mt-1">
          Love flowing through every creation — modern handmade traditions.
        </p>
        <p className="text-xs uppercase tracking-widest text-rose-400">Handmade • Heartmade</p>
      </div>
    </header>
  );
}
