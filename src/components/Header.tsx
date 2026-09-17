export default function Header() {
  return (
    <header className="bg-cream border-b-4 border-mustard">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col items-center text-center gap-3">
        <img
          src="/images/luvia-logo.jpg"
          alt="Luvia — Crochet, Accessories & More, made with love"
          className="h-40 w-40 md:h-44 md:w-44 rounded-full object-cover shadow-lg ring-4 ring-white"
        />
        <p className="text-cocoa/80 text-sm max-w-md font-medium">
          Browse our handmade crochet catalogue — every piece stitched with love.
        </p>
      </div>
    </header>
  );
}
