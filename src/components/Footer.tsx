import { getGeneralWhatsAppLink } from '../utils/whatsapp';

export default function Footer() {
  return (
    <footer className="bg-cocoa text-cream/90 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-8 text-center text-sm">
        <p className="font-heading text-lg text-mustard mb-1">Luvia</p>
        <p>&copy; {new Date().getFullYear()} Luvia. All items are handmade to order.</p>
        <a
          href={getGeneralWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-2 font-semibold text-white transition-colors hover:bg-[#1ebe5d]"
        >
          <span aria-hidden="true">💬</span>
          Order on WhatsApp
        </a>
      </div>
    </footer>
  );
}
