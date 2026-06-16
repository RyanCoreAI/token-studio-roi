import { resolve } from 'node:path';
import { loadPricing } from './pricing.mjs';

process.env.PRICING_REFRESH = '1';

const pricingCachePath = resolve(process.cwd(), 'data', 'official-pricing.json');
const pricing = await loadPricing(pricingCachePath);
console.log(`[pricing] official-docs verifiedAt=${pricing.verifiedAt} models=${pricing.models.length}`);
