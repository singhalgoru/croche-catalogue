export default function Header() {
  return (
    <header className="bg-cream border-b-4 border-mustard">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col items-center text-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}images/luvia-logo.jpg`}
          alt="Luvia — Crochet, Accessories & More, made with love"
          className="h-28 w-28 sm:h-36 sm:w-36 md:h-44 md:w-44 rounded-full object-cover shadow-lg ring-4 ring-white"
        />
        <p className="text-cocoa/80 text-sm max-w-md font-medium px-2">
          Browse our handmade crochet catalogue — every piece stitched with love.
        </p>
      </div>
    </header>
  );
}
