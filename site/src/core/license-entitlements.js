// Create this version separately in Gumroad. Keep the old Basic version name for prior sales.
export const CORE_BASIC_VARIANT = 'basic (core export)';

export function classifyLicense(purchase) {
  const variant = String(purchase.variants || purchase.variant_name || '').trim().toLowerCase();
  if (variant === CORE_BASIC_VARIANT) return { plan: 'basic', tier: 'Basic ($29)' };
  if (variant === 'agency' || variant === 'agency ($149)') return { plan: 'agency', tier: 'Agency ($149)' };
  if (['pro', 'pro ($79)', 'standard', 'standard ($49)'].includes(variant)) return { plan: 'pro', tier: 'Pro ($79)' };
  if (variant === 'basic' || variant === 'basic ($29)') return { plan: 'legacy', tier: 'Basic ($29)' };
  return { plan: 'legacy', tier: 'Existing license' };
}

export function getExportEntitlements(license, sandbox = false) {
  return {
    maxConversations: sandbox ? 500 : license?.valid ? Infinity : 50,
    advanced: sandbox || Boolean(license?.valid && license.plan !== 'basic')
  };
}

export function requiresAdvancedExport({ filters, deepExport, maskPatterns, bundleZip }) {
  return Boolean(Object.values(filters || {}).some(Boolean) || deepExport || maskPatterns || bundleZip);
}
