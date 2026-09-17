export default function Footer() {
  return (
    <footer className="border-t border-rose-200 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-rose-700">
        <p>&copy; {new Date().getFullYear()} Crochet Corner. All items are handmade to order.</p>
      </div>
    </footer>
  );
}
