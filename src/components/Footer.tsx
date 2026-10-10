import { formatWhatsAppNumber, getCollaborationWhatsAppLink, getGeneralWhatsAppLink } from '../utils/whatsapp';
import { trackContactClick } from '../services/analytics';
import { InstagramIcon, WhatsAppIcon } from './SocialIcons';

const INSTAGRAM_URL =
  'https://www.instagram.com/luvia.craftedwithlove?stkn=c3ZvM2pxMWw0Mnhl';

export default function Footer() {
  return (
    <>
    <section id="collaborate" aria-labelledby="collaboration-heading"
      className="mx-auto mt-8 w-full max-w-6xl scroll-mt-24 px-4 sm:mt-16">
      <div className="rounded-2xl border border-mustard/40 bg-cream p-5 text-center text-cocoa sm:p-8">
        <h2 id="collaboration-heading" className="font-heading text-2xl font-bold">Collaborate with Luvia</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base">
          Are you a maker or brand interested in collaborating with Luvia or selling your handmade
          products through us? We would love to hear from you. Contact us to explore opportunities.
        </p>
        <a href={getCollaborationWhatsAppLink()} target="_blank" rel="noopener noreferrer"
          onClick={() => trackContactClick('whatsapp', 'collaboration')}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-cocoa px-5 py-3 font-semibold text-cream hover:bg-cocoa/90">
          <WhatsAppIcon />
          Discuss a collaboration
        </a>
      </div>
    </section>
    <footer className="bg-cocoa text-cream/90 mt-8 sm:mt-16">
      <div className="max-w-6xl mx-auto px-4 py-5 sm:py-8 text-center text-sm">
        <p className="font-heading text-lg text-mustard mb-1">Luvia Creations</p>
        <p className="mb-2">Gurgaon, Haryana, India</p>
        <p className="mx-auto mb-2 hidden max-w-2xl text-cream/75 sm:block">
          Premium handmade crochet accessories, toys, gifts and decor,
          thoughtfully crafted in India.
        </p>
        <p>&copy; {new Date().getFullYear()} Luvia Creations.<span className="hidden sm:inline"> Check product availability in the catalogue.</span></p>
        <nav aria-label="Store information" className="mt-2 grid grid-cols-2 gap-x-3 sm:mt-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-5">
          <a href="/collections/" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">Explore collections</a>
          <a href="/about/" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">About &amp; contact</a>
          <a href="/faq/" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">Ordering FAQ</a>
          <a href="#collaborate" className="inline-flex min-h-11 items-center justify-center underline underline-offset-2 hover:text-mustard">Collaborate with us</a>
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
    </>
  );
}
