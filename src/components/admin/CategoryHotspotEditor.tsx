import { useState } from 'react';
import type { CategoryHotspot, Product } from '../../types/product';

export default function CategoryHotspotEditor({ image, products, hotspots, onChange, disabled }: {
  image: string;
  products: Product[];
  hotspots: CategoryHotspot[];
  onChange: (hotspots: CategoryHotspot[]) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState('');
  const [placing, setPlacing] = useState<number | 'new' | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const choices = products.filter(product => product.name.toLowerCase().includes(query.trim().toLowerCase()) || product.id === productId);
  const update = (index: number, values: Partial<CategoryHotspot>) =>
    onChange(hotspots.map((spot, position) => position === index ? { ...spot, ...values } : spot));
  const add = (x: number, y: number) => {
    if (!productId || hotspots.length >= 6) return;
    onChange([...hotspots, { productId, x, y }]);
    setPlacing(null);
  };
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-mustard/50 p-3">
    <legend className="px-1 font-semibold">Shop-the-look hotspots</legend>
    <p className="text-sm">Optional: link up to six markers to published products in this category. Replacing or removing the image clears its markers.</p>
    {imageFailed ? <p role="alert">The preview could not load. Re-upload the image or use the coordinate fields below.</p> :
      <div className="relative mx-auto max-w-xl">
        <button type="button" disabled={placing === null} aria-label="Place hotspot on collection image"
          onClick={event => {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            const x = Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)) * 100) / 100;
            const y = Math.round(Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)) * 100) / 100;
            if (placing === 'new') add(x, y);
            else if (placing !== null) { update(placing, { x, y }); setPlacing(null); }
          }}
          className={`block w-full ${placing !== null ? 'cursor-crosshair ring-2 ring-mustard' : ''}`}>
          <img src={image} alt="Hotspot placement preview" onError={() => setImageFailed(true)} className="block h-auto w-full rounded-lg" />
        </button>
        {hotspots.map((spot, index) => <span key={index} aria-hidden="true"
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          className="pointer-events-none absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-cocoa text-sm font-bold text-cream shadow">
          {index + 1}
        </span>)}
      </div>}
    <label className="block text-sm">Search hotspot products
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} className="mt-1 w-full rounded-lg border border-mustard p-2" />
    </label>
    <label className="block text-sm">Product for new hotspot
      <select value={productId} onChange={event => { setProductId(event.target.value); setPlacing(null); }}
        className="mt-1 w-full rounded-lg border border-mustard p-2">
        <option value="">Choose a product</option>
        {choices.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
      </select>
    </label>
    {!products.length && <p className="text-sm">Select and publish products in this category before adding hotspots.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!products.some(product => product.id === productId) || hotspots.length >= 6}
        onClick={() => setPlacing('new')} className="min-h-11 rounded-full border border-cocoa/30 px-4 text-sm font-semibold">
        Place new hotspot on photo
      </button>
      <button type="button" disabled={!products.some(product => product.id === productId) || hotspots.length >= 6}
        onClick={() => add(50, 50)} className="min-h-11 rounded-full border border-cocoa/30 px-4 text-sm">
        Add at centre
      </button>
    </div>
    {placing !== null && <p role="status" className="text-sm">Click the photo to {placing === 'new' ? 'add' : 'move'} the marker, or use Add at centre and edit its coordinates below.</p>}
    <ol className="space-y-3">
      {hotspots.map((spot, index) => <li key={index} className="space-y-2 rounded-lg bg-cream p-3">
        <p className="font-semibold">{index + 1}. {products.find(product => product.id === spot.productId)?.name ?? 'Product no longer in this category: remove this marker'}</p>
        <div className="flex flex-wrap items-end gap-3">
          {(['x', 'y'] as const).map(axis => <label key={axis} className="text-sm">
            {axis === 'x' ? 'Horizontal' : 'Vertical'} % for hotspot {index + 1}
            <input type="number" min={0} max={100} step="0.01" value={spot[axis]}
              onChange={event => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value) && value >= 0 && value <= 100) update(index, { [axis]: value });
              }} className="mt-1 block w-24 rounded-lg border border-mustard p-2" />
          </label>)}
          <button type="button" onClick={() => setPlacing(index)} className="min-h-11 rounded-full border border-cocoa/30 px-3 text-sm">Move hotspot {index + 1}</button>
          <button type="button" onClick={() => { onChange(hotspots.filter((_, position) => position !== index)); setPlacing(null); }}
            className="min-h-11 rounded-full border border-cocoa/30 px-3 text-sm">Remove hotspot {index + 1}</button>
        </div>
      </li>)}
    </ol>
  </fieldset>;
}
