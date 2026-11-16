export function formatMetaCreationError(message: string): string {
  return message.replace(
    /^(Meta object request failed \(HTTP \d{3}, code 100, subcode 1359188\)\.) Check permissions and account setup in Meta\./,
    '$1 Meta could not create the ad. This can indicate a payment method or billing/account eligibility issue. In Meta Ads Manager, check Billing & payments, verify a valid payment method, and resolve any outstanding balance or account restrictions. Paused ads still require billing eligibility.',
  );
}
