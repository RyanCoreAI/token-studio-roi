import { homedir } from 'node:os';
import { join } from 'node:path';
import { configuredPaths, expandPath } from '../collector-config.mjs';
import { collectStructuredUsage } from './structured-usage.mjs';

export const CLIENT_KEY = 'cursor';
export const SOURCE_LABEL = 'Cursor';

export function roots() {
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  return configuredPaths('cursor', 'roots', [
    appData ? join(appData, 'Cursor') : null,
    localAppData ? join(localAppData, 'Cursor') : null,
    join(homedir(), '.cursor'),
    '~/.config/Cursor',
    '~/Library/Application Support/Cursor'
  ]).map(expandPath).filter(Boolean);
}

export async function collect(pricingData = null) {
  return collectStructuredUsage({ clientKey: CLIENT_KEY, roots: roots(), pricingData });
}
