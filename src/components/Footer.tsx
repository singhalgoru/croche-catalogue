import { getGeneralWhatsAppLink } from '../utils/whatsapp';

const INSTAGRAM_URL =
  'https://www.instagram.com/luvia.craftedwithlove?stkn=c3ZvM2pxMWw0Mnhl';

export default function Footer() {
  return (
    <footer className="bg-cocoa text-cream/90 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-8 text-center text-sm">
        <p className="font-heading text-lg text-mustard mb-1">Luvia</p>
        <p>&copy; {new Date().getFullYear()} Luvia. All items are handmade to order.</p>
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={getGeneralWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-2 font-semibold text-white transition-colors hover:bg-[#1ebe5d]"
          >
            <span aria-hidden="true">💬</span>
            Contact on WhatsApp
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] px-5 py-2 font-semibold text-white transition-opacity hover:opacity-90"
          >
            <span aria-hidden="true">◎</span>
            Contact on Instagram
          </a>
        </div>
      </div>
    </footer>
  );
}
