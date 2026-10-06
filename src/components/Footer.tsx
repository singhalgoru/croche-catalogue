import { formatWhatsAppNumber, getGeneralWhatsAppLink } from '../utils/whatsapp';
import { trackContactClick } from '../services/analytics';
import { InstagramIcon, WhatsAppIcon } from './SocialIcons';

const INSTAGRAM_URL =
  'https://www.instagram.com/luvia.craftedwithlove?stkn=c3ZvM2pxMWw0Mnhl';

export default function Footer() {
  return (
    <footer className="bg-cocoa text-cream/90 mt-8 sm:mt-16">
      <div className="max-w-6xl mx-auto px-4 py-5 sm:py-8 text-center text-sm">
        <p className="font-heading text-lg text-mustard mb-1">Luvia Creations</p>
        <p className="mx-auto mb-2 hidden max-w-2xl text-cream/75 sm:block">
          Handmade crochet accessories, toys, gifts and decor,
          crafted with love in India.
        </p>
        <p>&copy; {new Date().getFullYear()} Luvia Creations.<span className="hidden sm:inline"> Check product availability in the catalogue.</span></p>
        <nav aria-label="Store information" className="mt-2 grid grid-cols-2 gap-x-3 sm:mt-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-5">
          <a href="/collections/" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">Explore collections</a>
          <a href="/about/" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">About &amp; contact</a>
          <a href="/faq/" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">Ordering FAQ</a>
          <a href="/return-policy/" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">
            Return and refund policy
          </a>
        </nav>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:items-center sm:justify-center sm:gap-3">
          <a
            href={getGeneralWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackContactClick('whatsapp', 'footer')}
            aria-label="Contact on WhatsApp"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 sm:px-5 py-2 font-semibold text-cocoa transition-colors hover:bg-[#1ebe5d]"
          >
            <WhatsAppIcon />
            <span><span className="hidden sm:inline">Contact on </span>WhatsApp</span>
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackContactClick('instagram', 'footer')}
            aria-label="Contact on Instagram"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] px-3 sm:px-5 py-2 font-semibold text-white transition-opacity hover:opacity-90"
          >
            <InstagramIcon />
            <span><span className="hidden sm:inline">Contact on </span>Instagram</span>
          </a>
        </div>
        <p className="mt-2 text-xs sm:text-sm">
          WhatsApp / mobile:{' '}
          <a
            href={getGeneralWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline underline-offset-2 hover:text-mustard"
          >
            {formatWhatsAppNumber()}
          </a>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:mt-5 sm:flex sm:items-center sm:justify-center sm:gap-6 sm:text-sm">
          <p className="min-w-0">
            <span className="block sm:inline">Orders: </span>
            <a
              href="mailto:orders@luviacreations.com"
              onClick={() => trackContactClick('email', 'footer_orders')}
              className="inline-flex min-h-11 max-w-full items-center break-all font-semibold text-cream underline underline-offset-2 hover:text-mustard"
            >
              orders@luviacreations.com
            </a>
          </p>
          <p className="min-w-0">
            <span className="block sm:inline">General enquiries: </span>
            <a
              href="mailto:hello@luviacreations.com"
              onClick={() => trackContactClick('email', 'footer_hello')}
              className="inline-flex min-h-11 max-w-full items-center break-all font-semibold text-cream underline underline-offset-2 hover:text-mustard"
            >
              hello@luviacreations.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
