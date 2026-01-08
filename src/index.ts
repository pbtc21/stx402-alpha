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
  price: 5000, // 0.005 STX for full alpha report
  quickPrice: 2000, // 0.002 STX for quick snapshot
  recipient: 'SPP5ZMH9NQDFD2K5CEQZ6P02AP8YPWMQ75TJW20M',
};

const HIRO_API = 'https://api.hiro.so';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

// Beautiful Frontend
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alpha Intelligence | Premium Trading Signals</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    .hero {
      text-align: center;
      padding: 60px 20px;
      background: radial-gradient(ellipse at top, rgba(255, 215, 0, 0.1) 0%, transparent 60%);
    }
    .hero h1 {
      font-size: 2.8rem;
      background: linear-gradient(135deg, #ffd700 0%, #ff6b35 50%, #ffd700 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 10px;
    }
    .hero .badge {
      display: inline-block;
      background: linear-gradient(135deg, #ffd700, #ff6b35);
      color: #000;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 700;
      margin-bottom: 15px;
    }
    .hero p { color: #888; font-size: 1.1rem; max-width: 600px; margin: 0 auto; }
    .data-sources {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 25px;
    }
    .source-tag {
      background: rgba(255, 215, 0, 0.1);
      border: 1px solid rgba(255, 215, 0, 0.3);
      color: #ffd700;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
    }
    .demo-section {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 30px;
      margin: 30px 0;
    }
    .demo-section h2 {
      color: #ffd700;
      font-size: 1.4rem;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .demo-btn {
      background: linear-gradient(135deg, #ffd700 0%, #ff6b35 100%);
      color: #000;
      border: none;
      padding: 15px 30px;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      margin-bottom: 20px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .demo-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(255, 215, 0, 0.3);
    }
    .demo-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .result-box {
      background: #0a0a0a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 20px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.85rem;
      overflow-x: auto;
      white-space: pre-wrap;
      max-height: 500px;
      overflow-y: auto;
    }
    .signal-card {
      background: rgba(255, 215, 0, 0.05);
      border-left: 3px solid #ffd700;
      padding: 15px;
      margin: 10px 0;
      border-radius: 0 8px 8px 0;
    }
    .signal-card.high { border-color: #ff4444; background: rgba(255, 68, 68, 0.1); }
    .signal-card.medium { border-color: #ffd700; }
    .signal-card h4 { color: #fff; margin-bottom: 5px; text-transform: uppercase; font-size: 0.85rem; }
    .signal-card p { color: #aaa; font-size: 0.9rem; }
    .signal-card .action {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 10px;
      background: rgba(255, 215, 0, 0.2);
      color: #ffd700;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .market-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .market-stat {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 15px;
      text-align: center;
    }
    .market-stat .label { color: #666; font-size: 0.8rem; text-transform: uppercase; }
    .market-stat .value { color: #ffd700; font-size: 1.3rem; font-weight: 700; margin-top: 5px; }
    .market-stat .change { font-size: 0.85rem; margin-top: 3px; }
    .market-stat .change.positive { color: #4caf50; }
    .market-stat .change.negative { color: #f44336; }
    .endpoints {
      display: grid;
      gap: 15px;
      margin-top: 20px;
    }
    .endpoint {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
    }
    .endpoint-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .endpoint-method {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .endpoint-method.post { background: #4caf50; color: #000; }
    .endpoint-method.get { background: #2196f3; color: #fff; }
    .endpoint-path { color: #ffd700; font-family: monospace; font-size: 1rem; }
    .endpoint-price { color: #888; font-size: 0.9rem; }
    .endpoint-desc { color: #aaa; font-size: 0.9rem; margin-top: 8px; }
    .risk-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .risk-badge.low { background: #4caf50; color: #000; }
    .risk-badge.moderate { background: #ff9800; color: #000; }
    .risk-badge.high { background: #f44336; color: #fff; }
    footer { text-align: center; padding: 40px 20px; color: #555; }
    footer a { color: #ffd700; text-decoration: none; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .loading { animation: pulse 1.5s infinite; }
  </style>
</head>
<body>
  <div class="hero">
    <div class="badge">x402 PREMIUM</div>
    <h1>Alpha Intelligence</h1>
    <p>Aggregated market intelligence from 7+ data sources, synthesized into actionable trading signals</p>
    <div class="data-sources">
      <span class="source-tag">Pyth Oracle</span>
      <span class="source-tag">CoinGecko</span>
      <span class="source-tag">KuCoin</span>
      <span class="source-tag">CoinPaprika</span>
      <span class="source-tag">Kraken</span>
      <span class="source-tag">Fear & Greed</span>
      <span class="source-tag">Hiro Whale API</span>
      <span class="source-tag">AI Synthesis</span>
    </div>
  </div>

  <div class="container">
    <div class="demo-section">
      <h2>Live Market Snapshot</h2>
      <div id="market-grid" class="market-grid">
        <div class="market-stat"><div class="label">Loading...</div><div class="value">--</div></div>
      </div>
      <button class="demo-btn" onclick="fetchQuickAlpha()">Get Live Alpha Signals (Free Demo)</button>
      <div id="signals-container"></div>
    </div>

    <div class="demo-section">
      <h2>API Endpoints</h2>
      <div class="endpoints">
        <div class="endpoint">
          <div class="endpoint-header">
            <div><span class="endpoint-method post">POST</span> <span class="endpoint-path">/alpha</span></div>
            <span class="endpoint-price">${CONTRACT.price} μSTX (${(CONTRACT.price / 1_000_000).toFixed(3)} STX)</span>
          </div>
          <div class="endpoint-desc">Full alpha intelligence report with all signals, risk assessment, whale activity, and AI-generated summary</div>
        </div>
        <div class="endpoint">
          <div class="endpoint-header">
            <div><span class="endpoint-method get">GET</span> <span class="endpoint-path">/alpha/quick</span></div>
            <span class="endpoint-price">${CONTRACT.quickPrice} μSTX (${(CONTRACT.quickPrice / 1_000_000).toFixed(3)} STX)</span>
          </div>
          <div class="endpoint-desc">Quick market snapshot with top 3 signals and overall risk level</div>
        </div>
      </div>
    </div>

    <div class="demo-section">
      <h2>Full Report Preview</h2>
      <button class="demo-btn" onclick="fetchFullDemo()">Preview Full Alpha Report</button>
      <div id="full-result" class="result-box" style="display: none;"></div>
    </div>
  </div>

  <footer>
    <p>Part of the <a href="https://pbtc21.dev">pbtc21.dev</a> x402 ecosystem</p>
    <p style="margin-top: 10px; font-size: 0.8rem;">Contract: ${CONTRACT.address}.${CONTRACT.name}</p>
  </footer>

  <script>
    async function fetchQuickAlpha() {
      const grid = document.getElementById('market-grid');
      const container = document.getElementById('signals-container');
      grid.innerHTML = '<div class="market-stat"><div class="label">Fetching...</div><div class="value loading">...</div></div>';
      container.innerHTML = '';

      try {
        // Fetch free data for demo
        const [btcRes, stxRes, fgRes] = await Promise.all([
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'),
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd&include_24hr_change=true'),
          fetch('https://api.alternative.me/fng/?limit=1')
        ]);

        const btc = await btcRes.json();
        const stx = await stxRes.json();
        const fg = await fgRes.json();

        const btcPrice = btc.bitcoin?.usd || 0;
        const btcChange = btc.bitcoin?.usd_24h_change || 0;
        const stxPrice = stx.blockstack?.usd || 0;
        const stxChange = stx.blockstack?.usd_24h_change || 0;
        const fgValue = parseInt(fg?.data?.[0]?.value || 50);
        const fgLabel = fg?.data?.[0]?.value_classification || 'Neutral';

        grid.innerHTML = \`
          <div class="market-stat">
            <div class="label">BTC/USD</div>
            <div class="value">$\${btcPrice.toLocaleString()}</div>
            <div class="change \${btcChange >= 0 ? 'positive' : 'negative'}">\${btcChange >= 0 ? '+' : ''}\${btcChange.toFixed(2)}%</div>
          </div>
          <div class="market-stat">
            <div class="label">STX/USD</div>
            <div class="value">$\${stxPrice.toFixed(4)}</div>
            <div class="change \${stxChange >= 0 ? 'positive' : 'negative'}">\${stxChange >= 0 ? '+' : ''}\${stxChange.toFixed(2)}%</div>
          </div>
          <div class="market-stat">
            <div class="label">Fear & Greed</div>
            <div class="value">\${fgValue}</div>
            <div class="change">\${fgLabel}</div>
          </div>
          <div class="market-stat">
            <div class="label">sBTC Yield</div>
            <div class="value">~11%</div>
            <div class="change">APY (3x loop)</div>
          </div>
        \`;

        // Generate demo signals
        const signals = [];
        if (btcChange < -2 && fgValue < 40) {
          signals.push({ type: 'Accumulation Zone', severity: 'high', desc: 'Fear + price decline = potential buying opportunity', action: 'ACCUMULATE' });
        }
        if (fgValue < 25) {
          signals.push({ type: 'Extreme Fear', severity: 'high', desc: \`Fear & Greed at \${fgValue} - historically good entry\`, action: 'BUY' });
        } else if (fgValue > 75) {
          signals.push({ type: 'Extreme Greed', severity: 'medium', desc: \`Fear & Greed at \${fgValue} - consider taking profits\`, action: 'REDUCE' });
        }
        signals.push({ type: 'Yield Opportunity', severity: 'medium', desc: 'sBTC yield at ~11% APY with 3x loop on Zest', action: 'DEPLOY' });

        if (signals.length > 0) {
          container.innerHTML = '<h3 style="color: #ffd700; margin: 20px 0 15px;">Detected Signals</h3>' +
            signals.map(s => \`
              <div class="signal-card \${s.severity}">
                <h4>\${s.type}</h4>
                <p>\${s.desc}</p>
                <span class="action">\${s.action}</span>
              </div>
            \`).join('');
        }
      } catch (e) {
        grid.innerHTML = '<div class="market-stat"><div class="label">Error</div><div class="value">Failed to fetch</div></div>';
      }
    }

    async function fetchFullDemo() {
      const result = document.getElementById('full-result');
      result.style.display = 'block';
      result.textContent = 'Loading full alpha report preview...';

      // Show sample report structure
      const sampleReport = {
        timestamp: new Date().toISOString(),
        payment_verified: "(requires X-Payment header)",
        market_snapshot: {
          btc_price: "fetched from 5 sources",
          stx_price: "fetched from 5 sources",
          sentiment: "bullish/bearish/neutral",
          fear_greed: "0-100 index"
        },
        signals: [
          { type: "sentiment_divergence", severity: "medium", description: "...", action: "accumulate" },
          { type: "yield_opportunity", severity: "high", description: "...", action: "deploy_capital" },
          { type: "whale_accumulation", severity: "high", description: "...", action: "accumulate" }
        ],
        alpha_summary: "AI-generated natural language summary of all signals and market conditions...",
        risk_assessment: {
          overall: "moderate",
          liquidation_risk: "low",
          volatility_regime: "normal"
        },
        yield_opportunity: {
          effectiveApy: 11.2,
          collateralMultiple: 3.36,
          liquidationRisk: "29.8% BTC drop"
        },
        data_sources: {
          prices: "BTC & STX from Pyth, CoinGecko, KuCoin, CoinPaprika, Kraken",
          sentiment: "Fear & Greed + momentum analysis",
          whale_activity: "Hiro API large transactions"
        }
      };

      result.textContent = JSON.stringify(sampleReport, null, 2);
    }

    // Auto-fetch on load
    fetchQuickAlpha();
  </script>
</body>
</html>`;
  return c.html(html);
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
