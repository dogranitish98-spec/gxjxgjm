export type Ticker24h = {
  symbol: string;
  baseAsset: string;
  lastPrice: number;
  priceChangePct: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
  bidPrice: number;
  askPrice: number;
  closeTimeMs: number;
};

export type UniverseConfig = {
  quote: string;
  minQuoteVolumeUsd: number;
  maxSpreadPct: number;
};

export const DEFAULT_UNIVERSE: UniverseConfig = {
  quote: "USDT",
  minQuoteVolumeUsd: 10_000_000,
  maxSpreadPct: 0.15,
};

const NON_CRYPTO = new Set([
  "USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "USDS", "USD1", "PYUSD", "USDE", "RLUSD", "AEUR",
  "EUR", "EURI", "GBP", "AUD", "BRL", "TRY", "RUB", "UAH", "PLN", "ZAR", "JPY", "ARS", "MXN", "COP",
  "CZK", "RON",
]);

export function spreadPct(t: Ticker24h): number | null {
  if (!(t.bidPrice > 0) || !(t.askPrice > 0) || t.askPrice < t.bidPrice) return null;
  const mid = (t.bidPrice + t.askPrice) / 2;
  return ((t.askPrice - t.bidPrice) / mid) * 100;
}

export function parseTickers(rows: Array<Record<string, string | number>>, config: UniverseConfig = DEFAULT_UNIVERSE) {
  const excluded: Record<string, number> = {};
  const eligible: Ticker24h[] = [];
  let quoteRows = 0;
  let newest = 0;
  const bump = (k: string) => {
    excluded[k] = (excluded[k] ?? 0) + 1;
  };

  for (const o of rows) {
    if (!o || typeof o !== "object") continue;
    const closeTime = Number(o.closeTime ?? 0);
    if (closeTime > newest) newest = closeTime;
    const symbol = String(o.symbol ?? "");
    if (symbol.length <= config.quote.length || !symbol.endsWith(config.quote)) continue;
    quoteRows++;
    const base = symbol.slice(0, symbol.length - config.quote.length);
    if (NON_CRYPTO.has(base)) {
      bump("stablecoin_or_fiat");
      continue;
    }
    const last = Number(o.lastPrice);
    const high = Number(o.highPrice);
    const low = Number(o.lowPrice);
    const change = Number(o.priceChangePercent);
    const quoteVolume = Number(o.quoteVolume);
    const bid = Number(o.bidPrice);
    const ask = Number(o.askPrice);
    const usable =
      Number.isFinite(last) && last > 0 && Number.isFinite(high) && Number.isFinite(low) && high >= low &&
      Number.isFinite(change) && Number.isFinite(quoteVolume) && quoteVolume >= 0;
    if (!usable) {
      bump("bad_data");
      continue;
    }
    if (quoteVolume < config.minQuoteVolumeUsd) {
      bump("low_volume");
      continue;
    }
    const rangePct = ((high - low) / last) * 100;
    if (last >= 0.97 && last <= 1.03 && rangePct <= 0.5 && Math.abs(change) <= 0.25) {
      bump("pegged");
      continue;
    }
    const ticker: Ticker24h = {
      symbol,
      baseAsset: base,
      lastPrice: last,
      priceChangePct: change,
      highPrice: high,
      lowPrice: low,
      quoteVolume,
      bidPrice: bid,
      askPrice: ask,
      closeTimeMs: closeTime,
    };
    const spread = spreadPct(ticker);
    if (spread == null) {
      bump("no_book");
      continue;
    }
    if (spread > config.maxSpreadPct) {
      bump("wide_spread");
      continue;
    }
    eligible.push(ticker);
  }
  eligible.sort((a, b) => b.quoteVolume - a.quoteVolume || a.symbol.localeCompare(b.symbol));
  return {
    eligible,
    totalRows: rows.length,
    quoteRows,
    excluded,
    serverNowMs: newest,
  };
}
