// AI Synthesis for Alpha Intelligence
import type { AggregatedData, Signal, RiskAssessment, Bindings } from './types';

interface SynthesisContext {
  data: AggregatedData;
  signals: Signal[];
  risk: RiskAssessment;
}

// Generate alpha summary using AI or fallback to template
export async function generateAlphaSummary(
  ctx: SynthesisContext,
  env?: Bindings
): Promise<string> {
  const apiKey = env?.OPENAI_API_KEY;

  if (apiKey) {
    return generateAISummary(ctx, apiKey);
  }

  return generateTemplateSummary(ctx);
}

// AI-powered summary generation
async function generateAISummary(ctx: SynthesisContext, apiKey: string): Promise<string> {
  const { data, signals, risk } = ctx;

  const prompt = `You are a crypto market analyst. Generate a 2-3 sentence actionable alpha summary.

Market Data:
- BTC: $${data.prices.btc.stats?.average?.toFixed(0) ?? 'N/A'} (${data.prices.btc.sources.find(s => s.source === 'coingecko')?.change_24h?.toFixed(1) ?? '0'}% 24h)
- STX: $${data.prices.stx.stats?.average?.toFixed(4) ?? 'N/A'}
- Fear & Greed: ${data.fearGreed.value} (${data.fearGreed.label})
- Sentiment: ${data.sentiment.sentiment} (score: ${data.sentiment.score})
- sBTC Yield: ${data.yield.effectiveApy}% APY
- Whale Activity: ${data.whales.largeTransactions} large txs, ${(data.whales.netFlow / 1000000).toFixed(2)}M STX net flow

Signals Detected:
${signals.map(s => `- ${s.type}: ${s.description} (${s.action})`).join('\n')}

Risk: ${risk.overall} overall, ${risk.volatility_regime} volatility

Provide actionable insight in 2-3 sentences. Be specific. No fluff.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a concise crypto market analyst. Give actionable insights only.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    const result = await response.json() as any;
    const summary = result.choices?.[0]?.message?.content?.trim();

    if (summary) {
      return summary;
    }
  } catch (error) {
    console.error('AI synthesis failed:', error);
  }

  // Fallback to template
  return generateTemplateSummary(ctx);
}

// Template-based summary generation
function generateTemplateSummary(ctx: SynthesisContext): string {
  const { data, signals, risk } = ctx;

  const btcPrice = data.prices.btc.stats?.average?.toFixed(0) ?? 'N/A';
  const btcChange = data.prices.btc.sources.find(s => s.source === 'coingecko')?.change_24h ?? 0;
  const sentiment = data.sentiment.sentiment;
  const fearGreed = data.fearGreed.value;

  // Build summary based on market conditions
  let marketState: string;
  if (btcChange > 3) {
    marketState = 'rallying';
  } else if (btcChange < -3) {
    marketState = 'pulling back';
  } else {
    marketState = 'consolidating';
  }

  let sentimentNote: string;
  if (fearGreed < 30) {
    sentimentNote = 'Extreme fear presents potential buying opportunity.';
  } else if (fearGreed > 70) {
    sentimentNote = 'Extreme greed suggests caution - consider taking profits.';
  } else {
    sentimentNote = `Market sentiment is ${sentiment}.`;
  }

  // Primary signal action
  const primarySignal = signals[0];
  let actionNote = '';
  if (primarySignal) {
    switch (primarySignal.action) {
      case 'accumulate':
        actionNote = 'Conditions favor accumulation.';
        break;
      case 'reduce':
        actionNote = 'Consider reducing exposure.';
        break;
      case 'deploy_capital':
        actionNote = `sBTC yield at ${data.yield.effectiveApy}% APY offers attractive returns.`;
        break;
      case 'arbitrage':
        actionNote = 'Price discrepancies across exchanges detected.';
        break;
      default:
        actionNote = 'Monitor for clearer signals.';
    }
  }

  // Yield mention if attractive
  const yieldNote = data.yield.effectiveApy > 7
    ? ` sBTC yield at ${data.yield.effectiveApy}% APY with ${data.yield.liquidationRisk} liquidation buffer.`
    : '';

  return `BTC ${marketState} at $${btcPrice} (${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(1)}% 24h). ${sentimentNote} ${actionNote}${yieldNote}`;
}
