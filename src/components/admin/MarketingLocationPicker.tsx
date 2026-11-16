import { useEffect, useRef, useState } from 'react';
import { searchMarketingLocations, type MarketingLocation } from '../../services/marketing';

export default function MarketingLocationPicker({ onChange, disabled, initialCoverage = 'country', planningOnly = true }: {
  onChange: (value: string, locations: MarketingLocation[] | null) => void;
  disabled: boolean;
  initialCoverage?: 'country' | 'specific';
  planningOnly?: boolean;
}) {
  const [mode, setMode] = useState(initialCoverage);
  const [locationType, setLocationType] = useState<MarketingLocation['type']>('region');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MarketingLocation[]>([]);
  const [results, setResults] = useState<MarketingLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => () => { requestId.current += 1; }, []);

  const resetSearch = () => {
    requestId.current += 1;
    setResults([]);
    setSearching(false);
    setSearched(false);
    setError('');
  };

  const search = async () => {
    const currentRequest = ++requestId.current;
    setSearching(true);
    setSearched(false);
    setResults([]);
    setError('');
    try {
      const locations = await searchMarketingLocations(query.trim(), locationType);
      if (requestId.current === currentRequest) {
        setResults(locations);
        setSearched(true);
      }
    } catch (failure) {
      if (requestId.current === currentRequest) {
        setError(failure instanceof Error ? failure.message : 'Unable to search Meta locations.');
      }
    } finally {
      if (requestId.current === currentRequest) setSearching(false);
    }
  };

  const choose = (locations: MarketingLocation[]) => {
    setSelected(locations);
    onChange(locations.map(location => location.label).join('; '), locations);
  };

  return <fieldset disabled={disabled} className="min-w-0 text-sm text-cocoa">
    <legend className="mb-1 font-medium">Target location</legend>
    <label className="grid gap-1">
      Location coverage
      <select value={mode} onChange={event => {
        const coverage = event.target.value === 'country' ? 'country' : 'specific';
        setMode(coverage);
        setSelected([]);
        setQuery('');
        resetSearch();
        onChange(coverage === 'country' ? 'India' : '', coverage === 'country' ? null : []);
      }} className="min-h-11 rounded-xl border border-cocoa/25 px-3">
        <option value="country">Entire India</option>
        <option value="specific">Specific states, cities or PIN codes</option>
      </select>
    </label>
    {mode === 'specific' && <div className="mt-3 grid gap-2">
      <label className="grid gap-1">
        Location type
        <select value={locationType} onChange={event => {
          setLocationType(event.target.value as MarketingLocation['type']);
          setQuery('');
          resetSearch();
        }} className="min-h-11 rounded-xl border border-cocoa/25 px-3">
          <option value="region">State / region</option>
          <option value="city">City</option>
          <option value="zip">Postal / PIN code</option>
        </select>
      </label>
      <label className="grid gap-1">
        Search Meta locations in India
        <input value={query} minLength={2} maxLength={100} onChange={event => {
          setQuery(event.target.value);
          resetSearch();
        }} className="min-h-11 rounded-xl border border-cocoa/25 px-3" />
      </label>
      <button type="button" onClick={() => void search()} disabled={searching || query.trim().length < 2}
        className="min-h-10 rounded-full border border-cocoa/30 px-4 font-semibold disabled:opacity-50">
        {searching ? 'Searching Meta...' : 'Search locations'}
      </button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {searched && results.length === 0 && <p role="status">No supported locations found. Try another name or location type.</p>}
      {results.length > 0 && <ul aria-label="Meta location results" className="max-h-48 overflow-y-auto rounded-xl border border-cocoa/15 p-2">
        {results.map(location => {
          const alreadySelected = selected.some(item => item.key === location.key && item.type === location.type);
          return <li key={`${location.type}-${location.key}`}>
            <button type="button" disabled={alreadySelected || selected.length >= 5}
              onClick={() => choose([...selected, location])}
              className="min-h-10 w-full rounded-lg px-2 py-1 text-left hover:bg-cream disabled:opacity-50">
              {alreadySelected ? 'Selected: ' : 'Add: '}{location.label}
            </button>
          </li>;
        })}
      </ul>}
      {selected.length > 0 && <ul aria-label="Selected target locations" className="grid gap-1">
        {selected.map(location => <li key={`${location.type}-${location.key}`} className="flex items-center justify-between gap-2">
          <span>{location.label}</span>
          <button type="button" aria-label={`Remove ${location.label}`}
            onClick={() => choose(selected.filter(item => item.key !== location.key || item.type !== location.type))}
            className="min-h-10 rounded-full border border-cocoa/30 px-3">Remove</button>
        </li>)}
      </ul>}
      <p className="text-xs text-cocoa/70">Select up to 5 locations returned by Meta. PIN-code availability depends on Meta.</p>
    </div>}
    <p className="mt-2 text-xs text-cocoa/70">{planningOnly
      ? 'Proposal planning only. This does not change Meta ad targeting.'
      : 'These locations will be used for the paused ad set. Audience guidance is not converted into interests or personal-trait targeting.'}</p>
  </fieldset>;
}
