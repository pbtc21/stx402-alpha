// STX402 Alpha Intelligence - Premium Trading Intelligence Endpoint
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, AlphaReport, AggregatedData, MarketSnapshot } from './types';
import { fetchTokenPrices, fetchSentiment, calculateYield, fetchWhaleActivity, fetchFearGreed } from './fetchers';
import { detectSignals, assessRisk } from './signals';
import { generateAlphaSummary } from './synthesis';

// Contract configuration (same as stx402-endpoint for payment consistency)
const CONTRACT = {
  address: 'SPP5ZMH9NQDFD2K5CEQZ6P02AP8YPWMQ75TJW20M',
  name: 'simple-oracle',
  price: 5000, // 5000 microSTX = 0.005 STX for full alpha report
  quickPrice: 2000, // 2000 microSTX = 0.002 STX for quick version
  recipient: 'SPP5ZMH9NQDFD2K5CEQZ6P02AP8YPWMQ75TJW20M',
};

const HIRO_API = 'https://api.hiro.so';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

// Health check & endpoint info
app.get('/', (c) => {
  return c.json({
    name: 'stx402-alpha',
    description: 'Premium Alpha Intelligence - aggregates multiple data sources into actionable trading intelligence',
    version: '1.0.0',
    contract: `${CONTRACT.address}.${CONTRACT.name}`,
    endpoints: {
      paid: [
        { path: '/alpha', method: 'POST', price: `${CONTRACT.price} microSTX (${CONTRACT.price / 1_000_000} STX)`, description: 'Full alpha intelligence report' },
        { path: '/alpha/quick', method: 'GET', price: `${CONTRACT.quickPrice} microSTX (${CONTRACT.quickPrice / 1_000_000} STX)`, description: 'Quick market snapshot with signals' },
      ],
      free: [
        { path: '/', method: 'GET', description: 'Health check and pricing info' },
      ],
    },
    data_sources: [
      'Pyth Oracle (on-chain)',
      'CoinGecko',
      'Binance',
      'CryptoCompare',
      'Kraken',
      'Fear & Greed Index',
      'Hiro API (whale activity)',
    ],
    value_proposition: 'One payment, complete market intelligence. Aggregates $3000+ microSTX worth of data + AI synthesis.',
  });
});

// x402 Payment Required response
function paymentRequired(c: any, resource: string, price: number) {
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  return c.json({
    error: 'Payment Required',
    code: 'PAYMENT_REQUIRED',
    resource,
    payment: {
      contract: `${CONTRACT.address}.${CONTRACT.name}`,
      function: 'call-with-stx',
      price,
      token: 'STX',
      recipient: CONTRACT.recipient,
      network: 'mainnet',
    },
    instructions: [
      '1. Call the contract function with STX payment',
      '2. Wait for transaction confirmation',
      '3. Retry request with X-Payment header containing txid',
    ],
    nonce,
    expiresAt,
  }, 402);
}

// Verify payment on-chain
async function verifyPayment(txid: string): Promise<{ valid: boolean; error?: string; caller?: string }> {
  try {
    const normalizedTxid = txid.startsWith('0x') ? txid : `0x${txid}`;

    const response = await fetch(`${HIRO_API}/extended/v1/tx/${normalizedTxid}`);
    if (!response.ok) {
      return { valid: false, error: 'Transaction not found' };
    }

    const tx = await response.json() as any;

    if (tx.tx_status !== 'success') {
      return { valid: false, error: `Transaction status: ${tx.tx_status}` };
    }

    if (tx.tx_type !== 'contract_call') {
      return { valid: false, error: 'Not a contract call' };
    }

    const expectedContract = `${CONTRACT.address}.${CONTRACT.name}`;
    if (tx.contract_call?.contract_id !== expectedContract) {
      return { valid: false, error: 'Wrong contract' };
    }

    if (tx.contract_call?.function_name !== 'call-with-stx') {
      return { valid: false, error: 'Wrong function' };
    }

    return { valid: true, caller: tx.sender_address };
  } catch (error) {
    return { valid: false, error: `Verification failed: ${error}` };
  }
}

// Full Alpha Intelligence Report
app.post('/alpha', async (c) => {
  const paymentTxid = c.req.header('X-Payment');

  if (!paymentTxid) {
    return paymentRequired(c, '/alpha', CONTRACT.price);
  }

  const verification = await verifyPayment(paymentTxid);
  if (!verification.valid) {
    return c.json({
      error: 'Payment verification failed',
      details: verification.error,
    }, 403);
  }

  // Fetch all data in parallel
  const [btcPrices, stxPrices, whales, fearGreed] = await Promise.all([
    fetchTokenPrices('BTC'),
    fetchTokenPrices('STX'),
    fetchWhaleActivity(),
    fetchFearGreed(),
  ]);

  // Sentiment and yield (sentiment needs prices)
  const [sentiment, yieldData] = await Promise.all([
    fetchSentiment(btcPrices, stxPrices),
    Promise.resolve(calculateYield(5.0)), // Default 5% base APY
  ]);

  // Aggregate data
  const aggregatedData: AggregatedData = {
    prices: { btc: btcPrices, stx: stxPrices },
    sentiment,
    yield: yieldData,
    whales,
    fearGreed,
  };

  // Detect signals and assess risk
  const signals = detectSignals(aggregatedData);
  const risk = assessRisk(aggregatedData);

  // Generate AI summary
  const alphaSummary = await generateAlphaSummary({ data: aggregatedData, signals, risk }, c.env);

  // Build market snapshot
  const marketSnapshot: MarketSnapshot = {
    btc_price: btcPrices.stats?.average ?? 0,
    stx_price: stxPrices.stats?.average ?? 0,
    btc_change_24h: btcPrices.sources.find(s => s.source === 'coingecko')?.change_24h ?? null,
    stx_change_24h: stxPrices.sources.find(s => s.source === 'coingecko')?.change_24h ?? null,
    price_spread_btc: `${btcPrices.stats?.spread_percent?.toFixed(2) ?? '0'}%`,
    price_spread_stx: `${stxPrices.stats?.spread_percent?.toFixed(2) ?? '0'}%`,
    sentiment: sentiment.sentiment,
    fear_greed: sentiment.fear_greed_index,
  };

  // Build full report
  const report: AlphaReport = {
    timestamp: new Date().toISOString(),
    payment_verified: true,
    caller: verification.caller!,
    market_snapshot: marketSnapshot,
    signals,
    alpha_summary: alphaSummary,
    risk_assessment: risk,
    yield_opportunity: yieldData,
    data_sources: {
      prices: { btc: btcPrices, stx: stxPrices },
      sentiment,
      whale_activity: whales,
    },
  };

  return c.json(report);
});

// Quick Alpha (lighter version)
app.get('/alpha/quick', async (c) => {
  const paymentTxid = c.req.header('X-Payment');

  if (!paymentTxid) {
    return paymentRequired(c, '/alpha/quick', CONTRACT.quickPrice);
  }

  const verification = await verifyPayment(paymentTxid);
  if (!verification.valid) {
    return c.json({
      error: 'Payment verification failed',
      details: verification.error,
    }, 403);
  }

  // Fetch essential data only (faster)
  const [btcPrices, stxPrices, fearGreed] = await Promise.all([
    fetchTokenPrices('BTC'),
    fetchTokenPrices('STX'),
    fetchFearGreed(),
  ]);

  const sentiment = await fetchSentiment(btcPrices, stxPrices);

  // Simplified aggregated data (no whales, simplified yield)
  const aggregatedData: AggregatedData = {
    prices: { btc: btcPrices, stx: stxPrices },
    sentiment,
    yield: calculateYield(5.0),
    whales: { netFlow: 0, largeTransactions: 0, topTransfers: [] },
    fearGreed,
  };

  const signals = detectSignals(aggregatedData);
  const risk = assessRisk(aggregatedData);

  return c.json({
    timestamp: new Date().toISOString(),
    payment_verified: true,
    caller: verification.caller,
    quick_snapshot: {
      btc: `$${btcPrices.stats?.average?.toFixed(0) ?? 'N/A'} (${btcPrices.sources.find(s => s.source === 'coingecko')?.change_24h?.toFixed(1) ?? '0'}%)`,
      stx: `$${stxPrices.stats?.average?.toFixed(4) ?? 'N/A'}`,
      sentiment: sentiment.sentiment,
      fear_greed: `${fearGreed.value} (${fearGreed.label})`,
    },
    signals: signals.slice(0, 3), // Top 3 signals
    risk: risk.overall,
    action: signals[0]?.action ?? 'hold',
  });
});

export default app;
