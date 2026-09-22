import type { Candle } from "./types";
import { intervalMs } from "./candles";

class Lcg {
  private s: number;
  constructor(seed: number) {
    this.s = seed & 0x7fffffff;
  }
  next(): number {
    this.s = (Math.imul(this.s, 1103515245) + 12345) & 0x7fffffff;
    return this.s / 2147483648;
  }
}

const SHAPES: Record<string, { drift: number; noise: number; seed: number; start: number }> = {
  BTCUSDT: { drift: 0.0004, noise: 0.004, seed: 11, start: 64000 },
  ETHUSDT: { drift: 0.0005, noise: 0.005, seed: 21, start: 4120 },
  SOLUSDT: { drift: 0.0008, noise: 0.008, seed: 31, start: 148 },
  BNBUSDT: { drift: 0.0003, noise: 0.004, seed: 41, start: 580 },
  XRPUSDT: { drift: 0.0002, noise: 0.006, seed: 51, start: 0.62 },
  DOGEUSDT: { drift: 0.0006, noise: 0.01, seed: 61, start: 0.14 },
  AVAXUSDT: { drift: 0.0004, noise: 0.007, seed: 71, start: 28 },
  LINKUSDT: { drift: 0.0005, noise: 0.006, seed: 81, start: 18 },
  DOTUSDT: { drift: 0.0001, noise: 0.006, seed: 91, start: 7.4 },
  NEARUSDT: { drift: 0.0007, noise: 0.009, seed: 101, start: 5.1 },
};

export function demoShape(symbol: string) {
  return SHAPES[symbol] ?? { drift: 0.0002, noise: 0.006, seed: hash(symbol), start: 25 };
}

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

export function syntheticCandles(
  symbol: string,
  interval: string,
  limit: number,
  nowMs = Date.now(),
): Candle[] {
  const ms = intervalMs(interval);
  const lastOpen = Math.floor(nowMs / ms) * ms;
  const first = lastOpen - (limit - 1) * ms;
  const shape = demoShape(symbol);
  const r = new Lcg(shape.seed + interval.charCodeAt(0) * 13);
  const out: Candle[] = [];
  let price = shape.start;
  for (let i = 0; i < limit; i++) {
    const open = price;
    const close = open * (1 + shape.drift + shape.noise * (r.next() * 2 - 1));
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;
    const volume = 1000 * (0.8 + 0.4 * r.next());
    const openTime = first + i * ms;
    out.push({
      openTimeMs: openTime,
      closeTimeMs: openTime + ms - 1,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return out;
}

export const DEMO_UNIVERSE = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "NEARUSDT",
  "ADAUSDT", "SUIUSDT", "ARBUSDT", "OPUSDT", "APTUSDT",
  "LTCUSDT", "ATOMUSDT", "FILUSDT", "INJUSDT", "TIAUSDT",
  "SEIUSDT", "WLDUSDT", "PEPEUSDT", "SHIBUSDT", "AAVEUSDT",
  "UNIUSDT", "CRVUSDT", "MKRUSDT", "LDOUSDT", "RUNEUSDT",
  "FETUSDT", "RENDERUSDT", "TAOUSDT", "ONDOUSDT", "JUPUSDT",
];

export function demoTickers(nowMs = Date.now()) {
  return DEMO_UNIVERSE.map((symbol, i) => {
    const c = syntheticCandles(symbol, "1h", 30, nowMs);
    const last = c[c.length - 2]!;
    const first = c[0]!;
    const change = ((last.close / first.close - 1) * 100);
    return {
      symbol,
      priceChangePercent: change.toFixed(2),
      lastPrice: last.close.toFixed(6),
      highPrice: Math.max(...c.map((x) => x.high)).toFixed(6),
      lowPrice: Math.min(...c.map((x) => x.low)).toFixed(6),
      bidPrice: (last.close * 0.9999).toFixed(6),
      askPrice: (last.close * 1.0001).toFixed(6),
      quoteVolume: (25_000_000 + i * 3_000_000 + last.volume * 800).toFixed(2),
      closeTime: last.closeTimeMs,
    };
  });
}
