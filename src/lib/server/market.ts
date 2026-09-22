import { parseClosed } from "@/lib/synaptick/candles";
import {
  demoTickers,
  syntheticCandles,
} from "@/lib/synaptick/demo-feed";
import type { Candle } from "@/lib/synaptick/types";

const BINANCE = "https://api.binance.com";

const cache = new Map<
  string,
  {
    at: number;
    value: unknown;
  }
>();

function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);

  if (
    hit &&
    Date.now() - hit.at < ttl
  ) {
    return Promise.resolve(
      hit.value as T,
    );
  }

  return load().then((value) => {
    cache.set(key, {
      at: Date.now(),
      value,
    });

    return value;
  });
}

async function fetchJson(
  url: string,
): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(
      `upstream ${res.status}`,
    );
  }

  return res.json();
}

export type KlineResult = {
  source:
    | "binance"
    | "demo";

  nowMs: number;

  symbol: string;

  interval: string;

  candles: Candle[];
};

type KlineRequest = {
  symbol: string;
  interval: string;
  limit: number;
};

type WrappedKlineRequest = {
  data: KlineRequest;
};

type KlineBatchRequest = {
  items: KlineRequest[];
};

type WrappedKlineBatchRequest = {
  data: KlineBatchRequest;
};

function normalizeSymbol(
  symbol: string,
): string {
  return symbol
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      "",
    )
    .slice(0, 20);
}

function normalizeInterval(
  interval: string,
): string {
  const allowed = [
    "1m",
    "5m",
    "15m",
    "1h",
    "4h",
    "1d",
  ];

  return allowed.includes(
    interval,
  )
    ? interval
    : "15m";
}

function normalizeLimit(
  limit: number,
): number {
  return Math.min(
    1000,
    Math.max(
      50,
      Math.floor(limit) || 200,
    ),
  );
}

/**
 * Fetch one kline series.
 *
 * Supports BOTH:
 *
 * fetchKlines({
 *   symbol,
 *   interval,
 *   limit,
 * })
 *
 * and the older format:
 *
 * fetchKlines({
 *   data: {
 *     symbol,
 *     interval,
 *     limit,
 *   },
 * })
 */
export function fetchKlines(
  data: KlineRequest,
): Promise<KlineResult>;

export function fetchKlines(
  data: WrappedKlineRequest,
): Promise<KlineResult>;

export async function fetchKlines(
  input:
    | KlineRequest
    | WrappedKlineRequest,
): Promise<KlineResult> {
  const data =
    "data" in input
      ? input.data
      : input;

  const symbol =
    normalizeSymbol(
      data.symbol,
    );

  const interval =
    normalizeInterval(
      data.interval,
    );

  const limit =
    normalizeLimit(
      data.limit,
    );

  const key =
    `k:${symbol}:${interval}:${limit}`;

  return cached(
    key,
    20_000,
    async () => {
      try {
        const rows =
          (await fetchJson(
            `${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
          )) as unknown[];

        const nowMs =
          Date.now();

        const candles =
          parseClosed(
            rows,
            nowMs,
            interval,
          ) ?? [];

        if (
          candles.length < 40
        ) {
          throw new Error(
            "short series",
          );
        }

        return {
          source:
            "binance" as const,

          nowMs,

          symbol,

          interval,

          candles,
        };
      } catch {
        /**
         * Binance can be unavailable because of:
         *
         * - network problems
         * - rate limits
         * - region restrictions
         * - temporary API errors
         *
         * Keep the application functional by
         * falling back to the built-in demo feed.
         */
        const nowMs =
          Date.now();

        const raw =
          syntheticCandles(
            symbol,
            interval,
            limit,
            nowMs,
          );

        const candles =
          raw.filter(
            (c) =>
              c.closeTimeMs <=
              nowMs,
          );

        return {
          source:
            "demo" as const,

          nowMs,

          symbol,

          interval,

          candles,
        };
      }
    },
  );
}

/**
 * Fetch multiple kline series.
 *
 * Supports all of these:
 *
 * fetchKlineBatch({
 *   items: [...]
 * })
 *
 * fetchKlineBatch({
 *   data: {
 *     items: [...]
 *   }
 * })
 *
 * and also a single request:
 *
 * fetchKlineBatch({
 *   symbol,
 *   interval,
 *   limit,
 * })
 *
 * fetchKlineBatch({
 *   data: {
 *     symbol,
 *     interval,
 *     limit,
 *   }
 * })
 */
export function fetchKlineBatch(
  data: KlineBatchRequest,
): Promise<KlineResult[]>;

export function fetchKlineBatch(
  data: WrappedKlineBatchRequest,
): Promise<KlineResult[]>;

export function fetchKlineBatch(
  data: KlineRequest,
): Promise<KlineResult>;

export function fetchKlineBatch(
  data: WrappedKlineRequest,
): Promise<KlineResult>;

export async function fetchKlineBatch(
  input:
    | KlineRequest
    | WrappedKlineRequest
    | KlineBatchRequest
    | WrappedKlineBatchRequest,
): Promise<
  KlineResult | KlineResult[]
> {
  /**
   * First unwrap the optional data property.
   */
  const inputData =
    "data" in input
      ? input.data
      : input;

  /**
   * Batch request.
   */
  if (
    "items" in inputData
  ) {
    const items =
      inputData.items.slice(
        0,
        24,
      );

    const out: KlineResult[] =
      [];

    for (
      const item of items
    ) {
      out.push(
        await fetchKlines(
          item,
        ),
      );
    }

    return out;
  }

  /**
   * Single request.
   *
   * This is supported for compatibility
   * with older components.
   */
  return fetchKlines(
    inputData,
  );
}

export type TickerResult = {
  source:
    | "binance"
    | "demo";

  nowMs: number;

  rows: Array<
    Record<
      string,
      string | number
    >
  >;
};

export async function fetchTickers(): Promise<TickerResult> {
  return cached(
    "tickers",
    25_000,
    async () => {
      try {
        const rows =
          (await fetchJson(
            `${BINANCE}/api/v3/ticker/24hr`,
          )) as Array<
            Record<
              string,
              string | number
            >
          >;

        if (
          !Array.isArray(rows) ||
          rows.length < 50
        ) {
          throw new Error(
            "thin",
          );
        }

        const nowMs =
          Number(
            rows[0]?.closeTime,
          ) ||
          Date.now();

        return {
          source:
            "binance" as const,

          nowMs,

          rows,
        };
      } catch {
        const nowMs =
          Date.now();

        return {
          source:
            "demo" as const,

          nowMs,

          rows:
            demoTickers(
              nowMs,
            ),
        };
      }
    },
  );
}
