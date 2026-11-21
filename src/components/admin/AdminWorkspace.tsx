import { useId, useState, type ReactNode } from 'react';

const sections = ['Products', 'Orders', 'Customers', 'Customer Love', 'Artisans', 'Sales', 'Materials', 'Financial snapshots', 'Marketing', 'Settings'] as const;
type Section = typeof sections[number];

export default function AdminWorkspace({ children, onSectionChange, initialSection = 'Products' }: {
  children: Record<Section, ReactNode>;
  onSectionChange?: (section: Section) => void;
  initialSection?: Section;
}) {
  const [active, setActive] = useState<Section>(initialSection);
  const id = useId();
  const changeSection = (section: Section) => {
    setActive(section);
    onSectionChange?.(section);
  };
  return <>
    <div className="sticky top-0 z-10 -mx-3 mb-4 bg-cream/95 px-3 py-2 backdrop-blur sm:hidden">
      <label htmlFor={`${id}-section`} className="block text-xs font-semibold uppercase tracking-wide text-cocoa/70">
        Jump to section
      </label>
      <select id={`${id}-section`} aria-label="Jump to admin section" value={active}
        onChange={event => changeSection(event.target.value as Section)}
        className="mt-1 min-h-12 w-full rounded-xl border border-cocoa/25 bg-white px-3 text-base font-semibold text-cocoa">
        {sections.map(section => <option key={section} value={section}>{section}</option>)}
      </select>
    </div>
    <nav aria-label="Admin workspace" className="mb-4 hidden grid-cols-4 gap-2 rounded-2xl bg-white p-2 shadow-sm sm:grid lg:grid-cols-10">
      {sections.map(section => <button key={section} type="button" aria-pressed={active === section}
        aria-controls={`${id}-${section}`} onClick={() => changeSection(section)}
        className={`min-h-11 rounded-xl px-2 text-sm font-semibold ${active === section ? 'bg-cocoa text-cream' : 'text-cocoa hover:bg-mustard/20'}`}>
        {section}
      </button>)}
    </nav>
    {sections.map(section => <section key={section} id={`${id}-${section}`} aria-label={`${section} workspace`}
      hidden={active !== section} className="space-y-4">
      {children[section]}
    </section>)}
  </>;
}
