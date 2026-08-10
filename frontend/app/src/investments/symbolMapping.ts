import type { InvestmentProvider } from './investmentsApi'

/**
 * Best-effort translation from a broker's own ticker convention to Yahoo
 * Finance's, so the holding detail card's company-research lookup has a
 * fighting chance of matching. Freedom24 (TraderNet) suffixes a ticker with
 * an ISO-ish country code (`VIO.GR`); Yahoo suffixes with the specific
 * exchange's own code (`VIO.AT`, the Athens exchange) — the two agree only
 * for a handful of markets. Binance identifies an asset by its bare ticker
 * (`BTC`); Yahoo prices crypto against a quote currency (`BTC-USD`).
 *
 * This is a heuristic, not a verified mapping — several countries have more
 * than one exchange, so a translated symbol can still miss. A miss just means
 * no enrichment shows up (the same quiet outcome as an untranslated symbol
 * that never had a chance), never a hard failure.
 */

// Freedom24/TraderNet's country-code suffix -> Yahoo Finance's exchange
// suffix. Covers the markets this app is actually likely to see, not every
// exchange in the world; an unlisted suffix is left untranslated rather than
// guessed at.
const FREEDOM24_SUFFIX_TO_YAHOO: Record<string, string> = {
  US: '', // Yahoo lists US tickers with no suffix at all.
  GR: 'AT', // Athens Exchange
  DE: 'DE', // XETRA
  UK: 'L', // London Stock Exchange
  GB: 'L',
  FR: 'PA', // Euronext Paris
  NL: 'AS', // Euronext Amsterdam
  IT: 'MI', // Borsa Italiana
  ES: 'MC', // Bolsa de Madrid
  CH: 'SW', // SIX Swiss Exchange
  CA: 'TO', // Toronto Stock Exchange
  HK: 'HK', // Hong Kong Stock Exchange
}

function translateFreedom24Symbol(symbol: string): string {
  const dot = symbol.lastIndexOf('.')
  if (dot === -1) return symbol
  const base = symbol.slice(0, dot)
  const suffix = symbol.slice(dot + 1).toUpperCase()
  const yahooSuffix = FREEDOM24_SUFFIX_TO_YAHOO[suffix]
  if (yahooSuffix == null) return symbol // Unknown suffix — try the symbol as-is.
  return yahooSuffix ? `${base}.${yahooSuffix}` : base
}

function translateBinanceSymbol(symbol: string): string {
  // Binance already treats stablecoins as cash (see the provider docstring),
  // so every position symbol reaching here is a genuine crypto asset — Yahoo
  // prices it against USD.
  return `${symbol}-USD`
}

/** Translates a broker-native ticker into Yahoo Finance's own convention. */
export function toYahooSymbol(symbol: string, provider: InvestmentProvider | null): string {
  if (provider === 'binance') return translateBinanceSymbol(symbol)
  if (provider === 'freedom24') return translateFreedom24Symbol(symbol)
  return symbol
}
