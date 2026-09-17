export default function Footer() {
  return (
    <footer className="bg-cocoa text-cream/90 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-8 text-center text-sm">
        <p className="font-heading text-lg text-mustard mb-1">Luvia</p>
        <p>&copy; {new Date().getFullYear()} Luvia. All items are handmade to order.</p>
      </div>
    </footer>
  );
}
