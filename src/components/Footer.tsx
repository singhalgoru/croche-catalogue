import { useId, useState } from 'react';
import { formatWhatsAppNumber, getCollaborationWhatsAppLink, getGeneralWhatsAppLink } from '../utils/whatsapp';
import { trackContactClick } from '../services/analytics';
import { InstagramIcon, WhatsAppIcon } from './SocialIcons';
import BulkOrders from './BulkOrders';

const INSTAGRAM_URL =
  'https://www.instagram.com/luvia.craftedwithlove?stkn=c3ZvM2pxMWw0Mnhl';

interface Props {
  showCollaboration?: boolean;
  showBulkOrders?: boolean;
}

export default function Footer({ showCollaboration = true, showBulkOrders = showCollaboration }: Props) {
  const [informationOpen, setInformationOpen] = useState(false);
  const informationId = useId();
  return (
    <>
    {showBulkOrders && <BulkOrders />}
    {showCollaboration && <section id="collaborate" aria-labelledby="collaboration-heading"
      className="mx-auto mt-8 w-full max-w-6xl scroll-mt-24 px-4 sm:mt-16">
      <div className="rounded-2xl border border-mustard/40 bg-cream p-5 text-center text-cocoa sm:p-8">
        <h2 id="collaboration-heading" className="font-heading text-2xl font-bold">Create with Luvia</h2>
        <p className="mx-auto mt-2 max-w-2xl font-heading text-lg font-semibold sm:text-xl">
          Celebrating artisan skill and working towards meaningful opportunities through handmade craft.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base">
          Love handmade work? We welcome expressions of interest from crochet makers, content
          creators and brands who would like to grow with Luvia.
        </p>
        <ul className="mx-auto mt-4 grid max-w-3xl gap-3 text-left text-sm sm:grid-cols-3">
          <li className="rounded-xl bg-white/60 p-4"><h3 className="font-semibold">Makers</h3>
            <p className="mt-1">Share your crochet work or handmade products for a possible collaboration.</p></li>
          <li className="rounded-xl bg-white/60 p-4"><h3 className="font-semibold">Creators</h3>
            <p className="mt-1">Explore storytelling, styling and content collaborations.</p></li>
          <li className="rounded-xl bg-white/60 p-4"><h3 className="font-semibold">Partners</h3>
            <p className="mt-1">Connect about pop-ups, retail partnerships or brand collaborations.</p></li>
        </ul>
        <p className="mx-auto mt-3 max-w-2xl text-xs">
          This is an invitation to connect, not an announcement of open jobs. Any opportunity,
          scope and terms will be discussed individually.
        </p>
        <a href={getCollaborationWhatsAppLink()} target="_blank" rel="noopener noreferrer"
          onClick={() => trackContactClick('whatsapp', 'collaboration')}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-cocoa px-5 py-3 font-semibold text-cream hover:bg-cocoa/90">
          <WhatsAppIcon />
          Introduce yourself
        </a>
      </div>
    </section>}
    <footer className="bg-cocoa text-cream/90 mt-8 sm:mt-16">
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-3 text-sm sm:px-6 md:pt-10">
        <button type="button" aria-expanded={informationOpen} aria-controls={informationId}
          onClick={() => setInformationOpen(open => !open)}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold text-cream focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mustard md:hidden">
          Help &amp; information
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={informationOpen ? 'rotate-180' : ''}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div id={informationId} className={`${informationOpen ? 'grid' : 'hidden'} gap-7 pb-6 pt-3 md:grid md:grid-cols-2 md:pt-0 lg:grid-cols-[1.1fr_0.8fr_1.2fr] lg:gap-10`}>
        <div className="hidden md:col-span-2 md:block lg:col-span-1">
        <p className="font-heading text-2xl font-semibold text-mustard">Luvia Creations</p>
        <p className="mt-2 max-w-sm leading-relaxed text-cream/80">
          Premium handmade crochet accessories, toys, gifts and decor,
          thoughtfully crafted in India.
        </p>
        <p className="mt-3 text-xs text-cream/70">Gurugram, Haryana, India</p>
        </div>
        <div>
        <h2 className="font-heading text-base font-semibold text-cream">Explore &amp; support</h2>
        <nav aria-label="Store information" className="mt-2 grid grid-cols-2 gap-x-4 md:grid-cols-1">
          <a href="/collections/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Explore collections</a>
          <a href="/bestsellers/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Bestsellers</a>
          <a href="/featured/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Featured products</a>
          <a href="/about/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">About &amp; contact</a>
          <a href="/faq/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Ordering FAQ</a>
          <a href="/bulk-orders/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Bulk orders &amp; corporate gifting</a>
          <a href="/terms-and-conditions/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Terms &amp; Conditions</a>
          <a href="/privacy-policy/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Privacy Policy</a>
          {showCollaboration && <a href="#collaborate" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">Work with Luvia</a>}
          <a href="/return-policy/" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-mustard hover:underline">
            Return and refund policy
          </a>
        </nav>
        </div>
        <div className="min-w-0">
        <h2 className="font-heading text-base font-semibold text-cream">Let's stay connected</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={getGeneralWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackContactClick('whatsapp', 'footer')}
            aria-label="Contact on WhatsApp"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] px-3 sm:px-5 py-2 font-semibold text-cocoa transition-colors hover:bg-[#1ebe5d]"
          >
            <WhatsAppIcon />
            <span>WhatsApp</span>
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
            <span>Instagram</span>
          </a>
        </div>
        <p className="mt-2 text-xs">
          WhatsApp / mobile:{' '}
          <a
            href={getGeneralWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 hover:text-mustard"
          >
            {formatWhatsAppNumber()}
          </a>
        </p>
        <div className="mt-2 space-y-2 text-xs">
          <p className="min-w-0">
            <span className="block text-cream/70">Order support</span>
            <a
              href="mailto:orders@luviacreations.com"
              onClick={() => trackContactClick('email', 'footer_orders')}
              className="inline-flex min-h-11 max-w-full items-center break-all font-semibold text-cream underline underline-offset-4 hover:text-mustard"
            >
              orders@luviacreations.com
            </a>
          </p>
          <p className="min-w-0">
            <span className="block text-cream/70">General enquiries</span>
            <a
              href="mailto:hello@luviacreations.com"
              onClick={() => trackContactClick('email', 'footer_hello')}
              className="inline-flex min-h-11 max-w-full items-center break-all font-semibold text-cream underline underline-offset-4 hover:text-mustard"
            >
              hello@luviacreations.com
            </a>
          </p>
        </div>
        </div>
        </div>
        <section aria-label="Share feedback" className="flex flex-wrap items-center justify-between gap-3 border-t border-cream/20 py-3 md:py-5">
          <a href="/about/" className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:text-mustard hover:underline md:hidden">
            Contact us
          </a>
          <div className="hidden md:block">
            <p className="font-semibold text-cream">Made with love. Better with your ideas.</p>
            <p className="mt-1 text-xs text-cream/75">A suggestion or a little feedback? We would love to hear it.</p>
          </div>
          <a href={`${import.meta.env.BASE_URL}?page=feedback`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-mustard/70 px-5 py-2 font-semibold text-mustard transition-colors hover:bg-mustard/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mustard">
            Share feedback
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </a>
        </section>
        <section aria-label="Payment methods" className="border-t border-cream/20 py-3 text-center md:py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:gap-x-6 md:gap-y-3">
          <p className="hidden text-base text-cream md:block">We accept</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:gap-x-6 md:gap-y-3" aria-label="Payment networks">
            <li className="flex h-7 items-center justify-center md:h-10">
              <img src="/images/payments/upi.svg" alt="UPI" width="68" height="24" loading="lazy" className="max-w-11 brightness-0 invert md:max-w-none" />
            </li>
            <li className="flex h-7 items-center justify-center md:h-10">
              <img src="/images/payments/visa.svg" alt="Visa" width="64" height="27" loading="lazy" className="max-w-11 brightness-0 invert md:max-w-none" />
            </li>
            <li className="flex h-7 items-center justify-center md:h-10">
              <img src="/images/payments/mastercard.svg" alt="Mastercard" width="58" height="36" loading="lazy" className="max-w-11 md:max-w-none" />
            </li>
            <li className="flex h-7 items-center justify-center md:h-10">
              <img src="/images/payments/amex.png" alt="American Express" width="50" height="50" loading="lazy" className="h-9 w-auto max-w-11 md:h-[50px] md:max-w-none" />
            </li>
            <li className="flex h-7 items-center justify-center md:h-10">
              <img src="/images/payments/rupay.svg" alt="RuPay" width="68" height="18" loading="lazy" className="max-w-11 brightness-0 invert md:max-w-none" />
            </li>
            <li className="hidden h-10 items-center justify-center gap-2 text-base text-cream md:flex">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M20 8H5a2 2 0 0 1 0-4h13v4M3 6v13a2 2 0 0 0 2 2h15V8" />
                <path d="M20 12h-5a2 2 0 0 0 0 4h5z" />
              </svg>
              Wallet
            </li>
          </ul>
          </div>
          <p className="mt-2 text-xs text-cream/75 md:mt-3">Secure payments via Razorpay. Available payment methods are shown at checkout.</p>
        </section>
        <p className="text-center text-xs text-cream/70">&copy; {new Date().getFullYear()} Luvia Creations.<span className="hidden sm:inline"> Check product availability in the catalogue.</span></p>
      </div>
    </footer>
    </>
  );
}
