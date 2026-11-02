type LinkableTestimonial = { id: string; display_name: string };
export function testimonialSlug(entry: LinkableTestimonial): string;
export function testimonialPath(entry: LinkableTestimonial): string;
export function readTestimonialSlug(pathname: string): string | null;
export function findTestimonialBySlug<T extends LinkableTestimonial>(entries: T[], slug: string): T | undefined;
