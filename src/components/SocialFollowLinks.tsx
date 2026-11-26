import { trackContactClick } from '../services/analytics';
import { FacebookIcon, InstagramIcon, PinterestIcon } from './SocialIcons';

type Variant = 'footer' | 'header' | 'menu';

const links = [
  {
    name: 'Instagram',
    label: 'Contact on Instagram',
    href: 'https://www.instagram.com/luvia.craftedwithlove?stkn=c3ZvM2pxMWw0Mnhl',
    channel: 'instagram',
    Icon: InstagramIcon,
    color: 'bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737]',
  },
  {
    name: 'Facebook',
    label: 'Follow Luvia on Facebook',
    href: 'https://www.facebook.com/profile.php?id=61596614701476',
    channel: 'facebook',
    Icon: FacebookIcon,
    color: 'bg-[#1877F2]',
  },
  {
    name: 'Pinterest',
    label: 'Follow Luvia on Pinterest',
    href: 'https://in.pinterest.com/luviacreations/',
    channel: 'pinterest',
    Icon: PinterestIcon,
    color: 'bg-[#E60023]',
  },
] as const;

const layoutClass: Record<Variant, string> = {
  footer: 'flex flex-wrap gap-3 md:gap-2',
  header: 'flex items-center gap-1.5',
  menu: 'grid grid-cols-3 justify-items-center gap-2',
};

const linkClass: Record<Variant, string> = {
  footer: 'inline-flex min-h-11 w-11 items-center justify-center rounded-full p-2 text-white transition-opacity hover:opacity-90',
  header: 'inline-flex min-h-10 w-10 items-center justify-center rounded-full text-white transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa',
  menu: 'inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa',
};

export default function SocialFollowLinks({ variant = 'footer' }: { variant?: Variant }) {
  const location = variant === 'footer' ? 'footer' : variant === 'header' ? 'header' : 'mobile_menu';
  return (
    <div role="group" aria-label="Follow Luvia on social media" className={layoutClass[variant]}>
      {links.map(({ name, label, href, channel, Icon, color }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackContactClick(channel, location)}
          aria-label={variant === 'menu' ? name : variant === 'header' ? `Follow Luvia on ${name}` : label}
          title={name}
          className={`${linkClass[variant]} ${variant === 'menu' ? '' : color}`}
        >
          <span className={variant === 'menu' ? `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${color}` : undefined}>
            <Icon className="h-5 w-5" />
          </span>
        </a>
      ))}
    </div>
  );
}
