import { useState } from 'react';
import type { Product } from '../../types/product';

export default function CategoryScenePrompt({ category, products, disabled }: {
  category: string; products: Product[]; disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [uses, setUses] = useState<Record<string, string>>({});
  const [scene, setScene] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const chosen = selected.flatMap(id => products.filter(product => product.id === id));
  const key = JSON.stringify([category, chosen, uses, scene]);
  const prompt = draft?.key === key ? draft.text : '';
  const generate = () => {
    setError(''); setCopied(false);
    setDraft({ key, text: [
      `Create one photorealistic "Shop this look" lifestyle photograph for the ${category} collection at Luvia Creations.`,
      'Use the attached product reference photos in the numbered order below. They are identity references, not a collage to reproduce. Preserve each product\'s exact crochet design, yarn texture, shape, colours, hardware and proportions. Do not invent additional variants or replace products with generic props.',
      'NON-NEGOTIABLE PRODUCT ACCURACY: Do not change the pattern, size or colour of ANY product. Preserve the exact stitch pattern, motif, stitch density, silhouette, dimensions, relative scale and original yarn colours from the reference photos and supplied measurements. Do not recolour, resize, stretch, simplify, redesign or add/remove product details. Only the setting, lighting, camera angle and placement may change. These preservation rules override any conflicting scene or practical-use instructions below. If size cannot be determined, ask for measurements rather than guessing.',
      'PRODUCT REFERENCES AND PRACTICAL USE:',
      ...chosen.map((product, index) => [
        `${index + 1}. ${product.name} (${product.category}).`,
        `Product description: ${product.description}`,
        `Original colour: ${product.color}. Match the attached photo; do not change its colour.`,
        product.materials ? `Materials: ${product.materials}.` : '',
        product.dimensions ? `Real dimensions: ${product.dimensions}. Preserve realistic scale.` : '',
        product.includedItems ? `Included items: ${product.includedItems}.` : '',
        uses[product.id]?.trim()
          ? `Show this practical use: ${uses[product.id].trim()}`
          : 'Show its genuine everyday use as supported by the reference photo and description. If its function is unclear, display it naturally without inventing a function.',
      ].filter(Boolean).join('\n')),
      scene.trim() ? `SCENE DIRECTION: ${scene.trim()}` : 'SCENE DIRECTION: Choose one believable, cohesive everyday setting where these products would naturally be used together. Use a warm cream and natural wood palette, soft daylight, and minimal supporting props. Avoid an unrelated product flat lay.',
      'COMPOSITION: One continuous scene, not separate panels, a contact sheet or a collage. Show every selected product recognisably in practical use, with realistic scale and natural relationships to surrounding objects. Keep products sharp, unobscured and visually separated so a shopper can identify each one. Do not force incompatible products into implausible uses; stage them in different functional areas of the same scene instead.',
      'HOTSPOT-READY: Leave clear visible areas on each product for clickable website hotspots to be added later. Keep all featured products safely inside the frame with breathing room. Do NOT draw hotspots, glowing dots, rings, numbers, arrows, labels, text, prices, logos or watermarks in the image.',
      'OUTPUT: A high-resolution square 1:1 photograph, ideally 2048 x 2048 or larger, with crisp crochet detail and natural, accurate colour. Export as WebP if supported; otherwise export the highest-quality image for conversion to WebP when uploaded. Deliver the photograph only.',
    ].join('\n\n') });
  };
  const copy = async () => {
    setError(''); setCopied(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable. Select the prompt below and copy it manually.');
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch (failure) {
      setError(`${failure instanceof Error ? failure.message : 'Unable to copy.'} Select the prompt and copy it manually.`);
    }
  };
  return <fieldset disabled={disabled} className="mt-4 space-y-3 rounded-xl border border-mustard/50 p-3">
    <legend className="px-1 font-semibold">Shop this look photo prompt</legend>
    <p className="text-sm">Choose up to six published products for the photo. This selection only builds a prompt; it does not change category membership or existing hotspots. No AI service is called.</p>
    <label className="block text-sm">Search scene products
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        className="mt-1 w-full rounded-lg border border-mustard p-2" />
    </label>
    <div className="max-h-64 space-y-2 overflow-y-auto">
      {products.filter(product => product.name.toLowerCase().includes(query.trim().toLowerCase())).map(product =>
        <label key={product.id} className="flex items-center gap-3 rounded-lg bg-cream p-2 text-sm">
          <input type="checkbox" checked={selected.includes(product.id)}
            disabled={!selected.includes(product.id) && chosen.length >= 6}
            onChange={event => setSelected(current => event.target.checked ? [...current, product.id] : current.filter(id => id !== product.id))} />
          <img src={product.image} alt="" loading="lazy" className="h-12 w-12 rounded object-contain" />
          {product.name}
        </label>)}
    </div>
    {!products.length && <p className="text-sm">Add published products to this category first. For a seasonal category, select its products above; saving is not required to build the prompt.</p>}
    <p className="text-xs">{chosen.length} / 6 scene products selected.</p>
    {chosen.map((product, index) => <div key={product.id} className="rounded-lg bg-cream p-3">
      <p className="text-sm font-semibold">Reference photo {index + 1}: {product.name}</p>
      <a href={product.image} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm underline">Open reference photo for {product.name}</a>
      <label className="block text-sm">Practical use for {product.name} (optional)
        <input value={uses[product.id] ?? ''} maxLength={500} onChange={event => setUses(current => ({ ...current, [product.id]: event.target.value }))}
          placeholder="Describe how this product should be used in the scene"
          className="mt-1 w-full rounded-lg border border-mustard p-2" />
      </label>
    </div>)}
    <label className="block text-sm">Scene or occasion (optional)
      <textarea value={scene} maxLength={1500} rows={2} onChange={event => setScene(event.target.value)}
        placeholder="For example: a festive living room, a cosy tea table, or a handbag by the front door"
        className="mt-1 w-full rounded-lg border border-mustard p-2" />
    </label>
    <button type="button" disabled={!chosen.length} onClick={generate}
      className="min-h-11 rounded-full border border-cocoa/30 px-4 py-2 font-semibold disabled:opacity-60">Generate scene prompt</button>
    {prompt && <>
      <label className="block text-sm font-semibold">Generated scene prompt
        <textarea readOnly value={prompt} rows={12} className="mt-1 w-full rounded-lg border border-mustard p-2 text-sm" />
      </label>
      <button type="button" onClick={() => { void copy(); }} className="min-h-11 rounded-full bg-cocoa px-4 py-2 text-cream">Copy scene prompt</button>
      <p className="text-sm">Attach the reference photos in the numbered order above to your image tool, then paste this prompt. A prompt alone cannot preserve the exact products. Review the result, upload it as the category cover, place hotspots on the matching products, then save. Uploading a new cover clears old hotspots.</p>
      {copied && <p role="status" className="text-sm">Scene prompt copied.</p>}
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </fieldset>;
}
