import Company from '../models/Company.js';

export function billingEnabled() {
  return String(process.env.BILLING_ENABLED || 'false').toLowerCase() === 'true';
}

export function defaultCurrency() {
  const c = String(process.env.BILLING_CURRENCY_DEFAULT || 'usd').toLowerCase();
  return c === 'ngn' ? 'ngn' : 'usd';
}

// Compute NGN prices from USD using env rate (defaults to conservative 1600 NGN per 1 USD)
export function getCreditPacks() {
  const usdToNgn = Number(process.env.NGN_PER_USD || 1600);
  const base = [
    { id: 'pack_100', credits: 100, usd: 29 },
    { id: 'pack_500', credits: 500, usd: 129 },
    { id: 'pack_2000', credits: 2000, usd: 399 }
  ];
  return base.map(p => ({
    id: p.id,
    credits: p.credits,
    price: {
      usd: p.usd,
      ngn: Math.round(p.usd * usdToNgn)
    }
  }));
}

export async function getCompanyUsage(companyId) {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new Error('Company not found');
  const balance = company.creditBalance || 0;
  const ledger = (company.ledger || []).slice(-100).reverse();
  return { balance, ledger, currency: company.billing?.currency || defaultCurrency() };
}

export async function mockAddCredits(companyId, packId, byUserId) {
  const packs = getCreditPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) throw new Error('Invalid pack');
  const company = await Company.findById(companyId);
  if (!company) throw new Error('Company not found');
  if (!company.billing) company.billing = {};
  if (!company.billing.currency) company.billing.currency = defaultCurrency();
  company.creditBalance = (company.creditBalance || 0) + pack.credits;
  company.ledger.push({
    delta: +pack.credits,
    reason: 'purchase',
    byUserId,
    currency: company.billing.currency,
    packId
  });
  await company.save();
  return { success: true, creditBalance: company.creditBalance };
}

export async function reserveCredit(companyId, byUserId, searchId, leadId) {
  const company = await Company.findById(companyId);
  if (!company) throw new Error('Company not found');
  if ((company.creditBalance || 0) <= 0) return { ok: false };
  company.creditBalance = (company.creditBalance || 0) - 1;
  company.ledger.push({
    delta: -1,
    reason: 'reserve',
    byUserId,
    searchId,
    leadId,
    currency: company.billing?.currency || defaultCurrency()
  });
  await company.save();
  return { ok: true };
}

export async function refundCredit(companyId, byUserId, searchId, leadId, reason = 'refund_invalid') {
  const company = await Company.findById(companyId);
  if (!company) throw new Error('Company not found');
  company.creditBalance = (company.creditBalance || 0) + 1;
  company.ledger.push({
    delta: +1,
    reason,
    byUserId,
    searchId,
    leadId,
    currency: company.billing?.currency || defaultCurrency()
  });
  await company.save();
}


