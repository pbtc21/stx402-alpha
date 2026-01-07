// Signal detection for Alpha Intelligence
import type { Signal, AggregatedData, RiskAssessment } from './types';

export function detectSignals(data: AggregatedData): Signal[] {
  const signals: Signal[] = [];

  // 1. Sentiment/Price Divergence
  // Bullish sentiment but price down = potential accumulation opportunity
  if (data.sentiment.score > 60 && (data.prices.btc.sources.find(s => s.source === 'coingecko')?.change_24h ?? 0) < -2) {
    signals.push({
      type: 'sentiment_divergence',
      severity: 'medium',
      description: 'Bullish sentiment despite price decline - potential accumulation zone',
      action: 'accumulate',
    });
  }
  // Bearish sentiment but price up = potential distribution
  else if (data.sentiment.score < 40 && (data.prices.btc.sources.find(s => s.source === 'coingecko')?.change_24h ?? 0) > 2) {
    signals.push({
      type: 'sentiment_divergence',
      severity: 'medium',
      description: 'Bearish sentiment despite price rise - potential distribution phase',
      action: 'reduce',
    });
  }

  // 2. Yield Opportunity
  if (data.yield.effectiveApy > 7) {
    const severity = data.yield.effectiveApy > 10 ? 'high' : 'medium';
    signals.push({
      type: 'yield_opportunity',
      severity,
      description: `sBTC yield at ${data.yield.effectiveApy}% APY with ${data.yield.collateralMultiple}x loop - above average`,
      action: 'deploy_capital',
    });
  }

  // 3. Whale Activity
  if (data.whales.largeTransactions > 3 && data.whales.netFlow > 500000) {
    signals.push({
      type: 'whale_accumulation',
      severity: 'high',
      description: `${data.whales.largeTransactions} large transactions detected with ${(data.whales.netFlow / 1000000).toFixed(2)}M STX net flow`,
      action: 'accumulate',
    });
  } else if (data.whales.largeTransactions > 3 && data.whales.netFlow < -500000) {
    signals.push({
      type: 'whale_distribution',
      severity: 'high',
      description: `${data.whales.largeTransactions} large transactions detected with ${(Math.abs(data.whales.netFlow) / 1000000).toFixed(2)}M STX outflow`,
      action: 'reduce',
    });
  }

  // 4. Price Arbitrage (spread > 0.5%)
  const btcSpread = data.prices.btc.stats?.spread_percent ?? 0;
  const stxSpread = data.prices.stx.stats?.spread_percent ?? 0;

  if (btcSpread > 0.5 || stxSpread > 0.5) {
    const token = btcSpread > stxSpread ? 'BTC' : 'STX';
    const spread = Math.max(btcSpread, stxSpread);
    signals.push({
      type: 'price_arbitrage',
      severity: spread > 1 ? 'high' : 'medium',
      description: `${token} showing ${spread.toFixed(2)}% price spread across exchanges`,
      action: 'arbitrage',
    });
  }

  // 5. Momentum Shift (Fear & Greed extreme levels)
  if (data.fearGreed.value < 25) {
    signals.push({
      type: 'momentum_shift',
      severity: 'high',
      description: `Extreme Fear (${data.fearGreed.value}) - historically good accumulation zone`,
      action: 'accumulate',
    });
  } else if (data.fearGreed.value > 75) {
    signals.push({
      type: 'momentum_shift',
      severity: 'medium',
      description: `Extreme Greed (${data.fearGreed.value}) - consider taking profits`,
      action: 'reduce',
    });
  }

  return signals;
}

export function assessRisk(data: AggregatedData): RiskAssessment {
  // Volatility regime based on price spreads and sentiment
  const avgSpread = ((data.prices.btc.stats?.spread_percent ?? 0) + (data.prices.stx.stats?.spread_percent ?? 0)) / 2;
  let volatility_regime: RiskAssessment['volatility_regime'];
  if (avgSpread < 0.2) volatility_regime = 'low';
  else if (avgSpread < 0.5) volatility_regime = 'normal';
  else if (avgSpread < 1) volatility_regime = 'high';
  else volatility_regime = 'extreme';

  // Liquidation risk from yield data
  const liquidationPct = parseFloat(data.yield.liquidationRisk.split('%')[0]);
  let liquidation_risk: RiskAssessment['liquidation_risk'];
  if (liquidationPct > 20) liquidation_risk = 'low';
  else if (liquidationPct > 10) liquidation_risk = 'moderate';
  else liquidation_risk = 'high';

  // Overall risk assessment
  let overall: RiskAssessment['overall'];
  const fearGreed = data.fearGreed.value;

  if (fearGreed < 20 || fearGreed > 80) {
    overall = volatility_regime === 'extreme' ? 'extreme' : 'high';
  } else if (fearGreed < 35 || fearGreed > 65) {
    overall = volatility_regime === 'high' ? 'high' : 'moderate';
  } else {
    overall = volatility_regime === 'low' ? 'low' : 'moderate';
  }

  return {
    overall,
    liquidation_risk,
    volatility_regime,
  };
}
