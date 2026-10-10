import { useId, useState, type ReactNode } from 'react';

const sections = ['Products', 'Orders', 'Customers', 'Sales', 'Snapshots', 'Settings'] as const;
type Section = typeof sections[number];

export default function AdminWorkspace({ children, onSectionChange }: {
  children: Record<Section, ReactNode>;
  onSectionChange?: (section: Section) => void;
}) {
  const [active, setActive] = useState<Section>('Products');
  const id = useId();
  return <>
    <nav aria-label="Admin workspace" className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm sm:grid-cols-6">
      {sections.map(section => <button key={section} type="button" aria-pressed={active === section}
        aria-controls={`${id}-${section}`} onClick={() => { setActive(section); onSectionChange?.(section); }}
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
