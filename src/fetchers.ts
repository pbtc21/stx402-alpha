// Data fetchers for Alpha Intelligence
import type { TokenPrices, PriceSource, SentimentData, YieldData, WhaleActivity } from './types';

const HIRO_API = 'https://api.hiro.so';

// Pyth Oracle configuration
const PYTH = {
  storage: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4',
  feeds: {
    BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    STX: '0xec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17',
  },
};

// Token configuration for price sources
const TOKEN_CONFIG: Record<string, { coingecko: string; kucoin: string; coinpaprika: string; pyth?: 'BTC' | 'STX' }> = {
  BTC: { coingecko: 'bitcoin', kucoin: 'BTC-USDT', coinpaprika: 'btc-bitcoin', pyth: 'BTC' },
  STX: { coingecko: 'blockstack', kucoin: 'STX-USDT', coinpaprika: 'stx-stacks', pyth: 'STX' },
};

// Parse Clarity hex value to BigInt
function parseClarityInt(hex: string): bigint {
  return BigInt('0x' + hex);
}

// Fetch price from Pyth oracle
async function getPythPrice(token: 'BTC' | 'STX'): Promise<{ price: number | null; timestamp: number } | null> {
  const feedId = PYTH.feeds[token];
  if (!feedId) return null;

  try {
    const [storageAddress, storageName] = PYTH.storage.split('.');
    const feedIdHex = feedId.slice(2);
    const clarityBuffer = `0x0200000020${feedIdHex}`;

    const response = await fetch(
      `${HIRO_API}/v2/contracts/call-read/${storageAddress}/${storageName}/get-price`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: storageAddress,
          arguments: [clarityBuffer],
        }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json() as any;

    if (data.okay && data.result) {
      const resultHex = data.result.slice(2);
      const priceMarker = '057072696365';
      const priceIdx = resultHex.indexOf(priceMarker);

      if (priceIdx !== -1) {
        const valueStart = priceIdx + priceMarker.length + 2;
        const valueHex = resultHex.slice(valueStart, valueStart + 32);
        const priceRaw = parseClarityInt(valueHex);
        const price = Number(priceRaw) / 100_000_000;

        return { price, timestamp: Date.now() };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Fetch aggregated prices for a token
export async function fetchTokenPrices(token: string): Promise<TokenPrices> {
  const ids = TOKEN_CONFIG[token];
  if (!ids) {
    return { token, timestamp: new Date().toISOString(), stats: null, sources: [] };
  }

  const sources = await Promise.all([
    // Pyth Oracle with timeout
    ids.pyth ? Promise.race([
      getPythPrice(ids.pyth).then(data => ({
        source: 'pyth',
        type: 'on-chain oracle',
        price: data?.price ?? null,
        timestamp: data?.timestamp ?? null,
        error: data ? null : 'No Pyth feed',
      })),
      new Promise<PriceSource>(resolve =>
        setTimeout(() => resolve({ source: 'pyth', type: 'on-chain oracle', price: null, timestamp: null, error: 'Timeout' }), 5000)
      ),
    ]) : Promise.resolve(null),

    // CoinGecko
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.coingecko}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`)
      .then(r => r.json())
      .then((data: any) => ({
        source: 'coingecko',
        type: 'aggregator',
        price: data[ids.coingecko]?.usd ?? null,
        change_24h: data[ids.coingecko]?.usd_24h_change ?? null,
        timestamp: data[ids.coingecko]?.last_updated_at ? data[ids.coingecko].last_updated_at * 1000 : null,
        error: null,
      }))
      .catch(e => ({ source: 'coingecko', type: 'aggregator', price: null, timestamp: null, error: e.message })),

    // KuCoin
    fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${ids.kucoin}`)
      .then(r => r.json())
      .then((data: any) => ({
        source: 'kucoin',
        type: 'exchange',
        price: data.data?.price ? parseFloat(data.data.price) : null,
        timestamp: data.data?.time ?? Date.now(),
        error: data.code !== '200000' ? data.msg : null,
      }))
      .catch(e => ({ source: 'kucoin', type: 'exchange', price: null, timestamp: null, error: e.message })),

    // CoinPaprika
    fetch(`https://api.coinpaprika.com/v1/tickers/${ids.coinpaprika}`)
      .then(r => r.json())
      .then((data: any) => ({
        source: 'coinpaprika',
        type: 'aggregator',
        price: data.quotes?.USD?.price ?? null,
        change_24h: data.quotes?.USD?.percent_change_24h ?? null,
        timestamp: data.last_updated ? new Date(data.last_updated).getTime() : Date.now(),
        error: data.error ?? null,
      }))
      .catch(e => ({ source: 'coinpaprika', type: 'aggregator', price: null, timestamp: null, error: e.message })),

    // Kraken
    fetch(`https://api.kraken.com/0/public/Ticker?pair=${token}USD`)
      .then(r => r.json())
      .then((data: any) => {
        const pair = Object.keys(data.result || {})[0];
        const price = pair ? parseFloat(data.result[pair]?.c?.[0]) : null;
        return {
          source: 'kraken',
          type: 'exchange',
          price: price || null,
          timestamp: Date.now(),
          error: data.error?.length ? data.error[0] : null,
        };
      })
      .catch(e => ({ source: 'kraken', type: 'exchange', price: null, timestamp: null, error: e.message })),
  ]);

  const validSources = sources.filter((s): s is PriceSource => s !== null);
  const prices = validSources.filter(s => s.price !== null).map(s => s.price as number);

  let stats = null;
  if (prices.length > 0) {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const spread = ((max - min) / avg) * 100;

    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    stats = {
      average: parseFloat(avg.toFixed(6)),
      median: parseFloat(median.toFixed(6)),
      min: parseFloat(min.toFixed(6)),
      max: parseFloat(max.toFixed(6)),
      spread_percent: parseFloat(spread.toFixed(4)),
      sources_available: prices.length,
      sources_total: validSources.length,
    };
  }

  return {
    token,
    timestamp: new Date().toISOString(),
    stats,
    sources: validSources.map(s => ({
      ...s,
      price: s.price !== null ? parseFloat((s.price as number).toFixed(6)) : null,
      deviation_from_avg: s.price !== null && stats
        ? parseFloat((((s.price as number) - stats.average) / stats.average * 100).toFixed(4))
        : null,
    })),
  };
}

// Fetch sentiment data
export async function fetchSentiment(btcPrices: TokenPrices, stxPrices: TokenPrices): Promise<SentimentData> {
  // Get CoinGecko 7d change and Fear & Greed
  const [btcDetails, fearGreedData] = await Promise.all([
    fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false')
      .then(r => r.json())
      .catch(() => null),
    fetch('https://api.alternative.me/fng/?limit=1')
      .then(r => r.json())
      .catch(() => null),
  ]);

  const change24h = btcPrices.sources.find(s => s.source === 'coingecko')?.change_24h ?? null;
  const change7d = (btcDetails as any)?.market_data?.price_change_percentage_7d ?? null;
  const fearGreed = (fearGreedData as any)?.data?.[0];
  const fgValue = parseInt(fearGreed?.value || '50');
  const fgLabel = fearGreed?.value_classification || 'Neutral';

  // Algorithmic sentiment calculation
  const momentum = (change24h || 0) + (change7d || 0) / 2;

  let sentiment: SentimentData['sentiment'];
  let score: number;

  if (momentum < -10) { sentiment = 'very_bearish'; score = 15; }
  else if (momentum < -3) { sentiment = 'bearish'; score = 35; }
  else if (momentum < 3) { sentiment = 'neutral'; score = 50; }
  else if (momentum < 10) { sentiment = 'bullish'; score = 65; }
  else { sentiment = 'very_bullish'; score = 85; }

  // Blend with fear/greed
  score = Math.round((score + fgValue) / 2);

  return {
    sentiment,
    score,
    confidence: 0.7,
    fear_greed_index: fgValue,
    fear_greed_label: fgLabel,
    change_24h: change24h,
    change_7d: change7d,
  };
}

// Calculate sBTC yield (Zest Protocol looping strategy)
export function calculateYield(baseApy: number = 5.0): YieldData {
  const borrowRatio = 0.8;
  const iterations = 5;

  let collateral = 1; // normalized
  for (let i = 0; i < iterations; i++) {
    collateral += collateral * borrowRatio;
  }

  const collateralMultiple = collateral;
  const borrowCostRate = 0.02;
  const effectiveApy = baseApy * collateralMultiple - borrowCostRate * (collateralMultiple - 1) * 100;
  const liquidationThreshold = (1 / collateralMultiple) * 100;

  return {
    effectiveApy: parseFloat(effectiveApy.toFixed(2)),
    collateralMultiple: parseFloat(collateralMultiple.toFixed(2)),
    liquidationRisk: `${liquidationThreshold.toFixed(1)}% BTC drop`,
    baseApy,
  };
}

// Fetch whale activity from Hiro API
export async function fetchWhaleActivity(): Promise<WhaleActivity> {
  try {
    // Fetch recent large STX transactions (>100k STX)
    const response = await fetch(`${HIRO_API}/extended/v1/tx?limit=50&type=token_transfer`);
    if (!response.ok) {
      return { netFlow: 0, largeTransactions: 0, topTransfers: [] };
    }

    const data = await response.json() as any;
    const transactions = data.results || [];

    // Filter for large STX transfers (amount in microSTX, so 100k STX = 100_000_000_000)
    const WHALE_THRESHOLD = 100_000_000_000; // 100k STX
    const largeTransfers = transactions.filter((tx: any) => {
      const amount = parseInt(tx.token_transfer?.amount || '0');
      return amount >= WHALE_THRESHOLD;
    });

    // Calculate net flow (simplified - positive means accumulation)
    let netFlow = 0;
    const topTransfers: WhaleActivity['topTransfers'] = [];

    for (const tx of largeTransfers.slice(0, 5)) {
      const amount = parseInt(tx.token_transfer?.amount || '0') / 1_000_000; // Convert to STX
      // Simplified: consider all transfers as neutral for now
      // In reality, you'd track specific whale addresses
      topTransfers.push({
        amount,
        type: 'in', // simplified
        tx_id: tx.tx_id,
      });
      netFlow += amount;
    }

    return {
      netFlow,
      largeTransactions: largeTransfers.length,
      topTransfers,
    };
  } catch {
    return { netFlow: 0, largeTransactions: 0, topTransfers: [] };
  }
}

// Fetch Fear & Greed Index directly
export async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1');
    const data = await response.json() as any;
    const fg = data?.data?.[0];
    return {
      value: parseInt(fg?.value || '50'),
      label: fg?.value_classification || 'Neutral',
    };
  } catch {
    return { value: 50, label: 'Neutral' };
  }
}
