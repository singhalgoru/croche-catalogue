import { useCallback, useEffect, useState } from 'react';
import { fetchMarketingOverview, type MarketingOverview } from '../../services/marketing';

const numberLabel = (value: number) => new Intl.NumberFormat('en-IN').format(value);
const moneyLabel = (value: number, currency: string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency, maximumFractionDigits: 2,
}).format(value);

export default function MarketingDashboard() {
  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshOverview = useCallback(() => {
    setLoading(true);
    setError('');
    void fetchMarketingOverview().then(setOverview).catch(failure => {
      setError(failure instanceof Error ? failure.message : 'Unable to load Meta marketing data.');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let current = true;
    void fetchMarketingOverview().then(value => {
      if (current) setOverview(value);
    }).catch(failure => {
      if (current) setError(failure instanceof Error ? failure.message : 'Unable to load Meta marketing data.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, []);

  return <section aria-label="Marketing overview" className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-heading text-xl font-bold text-cocoa">Marketing overview</h2>
        <p className="mt-1 text-sm text-cocoa/70">Read-only Meta account and delivery data for the last 30 days.</p>
      </div>
      <button type="button" onClick={refreshOverview} disabled={loading}
        className="min-h-11 rounded-full border border-cocoa/30 px-4 text-sm font-semibold text-cocoa disabled:opacity-50">
        {loading ? 'Refreshing…' : 'Refresh Meta data'}
      </button>
    </div>
    {loading && !overview && <p role="status" className="mt-4 text-sm text-cocoa/70">Connecting to the Meta ad account…</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {overview && <>
      <div className="mt-4 rounded-xl bg-cream p-4 text-sm text-cocoa">
        <h3 className="font-semibold">{overview.account.name}</h3>
        <p className="mt-1">Account {overview.account.id} · {overview.account.currency} · {overview.account.timezoneName}</p>
        <p>Meta account status: {overview.account.status}</p>
      </div>
      <dl className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[
          ['Spend · 30 days', moneyLabel(overview.metrics.spend, overview.account.currency)],
          ['Impressions', numberLabel(overview.metrics.impressions)],
          ['Reach', numberLabel(overview.metrics.reach)],
          ['Link clicks', numberLabel(overview.metrics.linkClicks)],
          ['Link CTR', `${overview.metrics.ctr.toFixed(2)}%`],
          ['Cost per link click', moneyLabel(overview.metrics.cpc, overview.account.currency)],
          ['CPM', moneyLabel(overview.metrics.cpm, overview.account.currency)],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-cream p-3 text-cocoa">
          <dt className="text-xs">{label}</dt>
          <dd className="mt-1 text-lg font-bold">{value}</dd>
        </div>)}
      </dl>
      <div className="mt-5">
        <h3 className="font-heading text-lg font-bold text-cocoa">Campaigns</h3>
        {overview.campaigns.length === 0 ? <p className="mt-2 text-sm text-cocoa/70">No campaigns were returned for this ad account.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm text-cocoa">
              <thead><tr className="border-b border-cocoa/20">
                <th scope="col" className="p-2">Campaign</th>
                <th scope="col" className="p-2">Objective</th>
                <th scope="col" className="p-2">Configured status</th>
                <th scope="col" className="p-2">Delivery status</th>
              </tr></thead>
              <tbody>{overview.campaigns.map(campaign => <tr key={campaign.id} className="border-b border-cocoa/10">
                <th scope="row" className="p-2 font-semibold">{campaign.name}</th>
                <td className="p-2">{campaign.objective}</td>
                <td className="p-2">{campaign.status}</td>
                <td className="p-2">{campaign.effectiveStatus}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-cocoa/65">
        Meta-reported delivery metrics are not confirmed website orders. No campaign changes can be made from this screen.
      </p>
    </>}
  </section>;
}
