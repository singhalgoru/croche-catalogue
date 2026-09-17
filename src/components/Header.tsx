export default function Header() {
  return (
    <header className="bg-gradient-to-b from-pink-50 to-rose-100/60 border-b border-rose-200">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col items-center text-center gap-3">
        <img
          src="/images/luvia-logo.jpg"
          alt="Luvia — Crochet, Accessories & More, made with love"
          className="h-40 w-40 md:h-44 md:w-44 rounded-full object-cover shadow-lg ring-4 ring-white"
        />
        <p className="text-rose-800/80 text-sm max-w-md">
          Browse our handmade crochet catalogue — every piece stitched with love.
        </p>
      </div>
    </header>
  );
}
