const apiKey = process.env.GST_ACCELERATOR_API_KEY;

if (!apiKey) {
  console.error('Set GST_ACCELERATOR_API_KEY in this process environment before running the test.');
  process.exit(1);
}

const response = await fetch('https://gstaccelerator.in/api/v1/lookup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({
    description: 'Handmade cotton crochet keychain; small handcrafted bag charm',
    supply_type: 'intrastate',
    branded: false,
  }),
  signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
  console.error(`GST Accelerator returned HTTP ${response.status}. Response body was not printed.`);
  process.exit(1);
}

const payload = await response.json();
const matches = Array.isArray(payload) ? payload : [payload];
if (matches.length === 0) {
  console.error('GST Accelerator returned no HSN matches.');
  process.exit(1);
}

console.log(JSON.stringify(matches.map((match) => ({
  hsn_code: match?.hsn_code,
  description: match?.description,
  tax_rates: match?.tax_rates,
  rate_field_types: Object.fromEntries(
    ['igst', 'cgst', 'sgst', 'cess'].map((field) => [
      field,
      match?.tax_rates?.[field] === null
        ? 'null'
        : typeof match?.tax_rates?.[field],
    ]),
  ),
  applicable_rate: match?.applicable_rate,
  condition_applied: match?.condition_applied,
  condition_warning: match?.condition_warning,
  confidence: match?.confidence,
  notification_ref: match?.notification_ref,
  needs_review: match?.needs_review,
})), null, 2));
