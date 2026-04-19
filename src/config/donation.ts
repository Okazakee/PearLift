export type DonationMethod = 'bitcoin' | 'lightning';

export interface DonationTarget {
  method: DonationMethod;
  label: string;
  uri: string;
  copyValue: string;
  isPlaceholder: boolean;
}

export type DonationTargetResolver = () => DonationTarget[];

const PLACEHOLDER_BITCOIN_ADDRESS =
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const PLACEHOLDER_LIGHTNING_INVOICE = 'lnbc1placeholderinvoice';

function buildBitcoinUri(address: string, label: string) {
  const query = `label=${encodeURIComponent(label)}`;
  return `bitcoin:${address}?${query}`;
}

function resolvePlaceholderDonationTargets() {
  return [
    {
      method: 'bitcoin',
      label: 'Bitcoin (On-chain)',
      uri: buildBitcoinUri(PLACEHOLDER_BITCOIN_ADDRESS, 'PearLift Donation'),
      copyValue: PLACEHOLDER_BITCOIN_ADDRESS,
      isPlaceholder: true,
    },
    {
      method: 'lightning',
      label: 'Lightning',
      uri: `lightning:${PLACEHOLDER_LIGHTNING_INVOICE}`,
      copyValue: PLACEHOLDER_LIGHTNING_INVOICE,
      isPlaceholder: true,
    },
  ] satisfies DonationTarget[];
}

let activeDonationTargetResolver: DonationTargetResolver =
  resolvePlaceholderDonationTargets;

export function setDonationTargetResolver(resolver: DonationTargetResolver) {
  activeDonationTargetResolver = resolver;
}

export function getDonationTargets() {
  return activeDonationTargetResolver();
}
