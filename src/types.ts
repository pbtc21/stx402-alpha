// Types for STX402 Alpha Intelligence

export interface PriceSource {
  source: string;
  type: string;
  price: number | null;
  change_24h?: number | null;
  timestamp: number | null;
  error: string | null;
  deviation_from_avg?: number | null;
}

export interface PriceStats {
  average: number;
  median: number;
  min: number;
  max: number;
  spread_percent: number;
  sources_available: number;
  sources_total: number;
}

export interface TokenPrices {
  token: string;
  timestamp: string;
  stats: PriceStats | null;
  sources: PriceSource[];
}

export interface SentimentData {
  sentiment: 'very_bearish' | 'bearish' | 'neutral' | 'bullish' | 'very_bullish';
  score: number;
  confidence: number;
  fear_greed_index: number;
  fear_greed_label: string;
  change_24h: number | null;
  change_7d: number | null;
}

export interface YieldData {
  effectiveApy: number;
  collateralMultiple: number;
  liquidationRisk: string;
  baseApy: number;
}

export interface WhaleActivity {
  netFlow: number; // positive = accumulation, negative = distribution
  largeTransactions: number;
  topTransfers: Array<{
    amount: number;
    type: 'in' | 'out';
    tx_id: string;
  }>;
}

export interface Signal {
  type: 'sentiment_divergence' | 'yield_opportunity' | 'whale_accumulation' | 'whale_distribution' | 'price_arbitrage' | 'momentum_shift';
  severity: 'low' | 'medium' | 'high';
  description: string;
  action: 'accumulate' | 'hold' | 'reduce' | 'deploy_capital' | 'wait' | 'arbitrage';
}

export interface RiskAssessment {
  overall: 'low' | 'moderate' | 'high' | 'extreme';
  liquidation_risk: 'low' | 'moderate' | 'high';
  volatility_regime: 'low' | 'normal' | 'high' | 'extreme';
}

export interface MarketSnapshot {
  btc_price: number;
  stx_price: number;
  btc_change_24h: number | null;
  stx_change_24h: number | null;
  price_spread_btc: string;
  price_spread_stx: string;
  sentiment: string;
  fear_greed: number;
}

export interface AlphaReport {
  timestamp: string;
  payment_verified: boolean;
  caller: string;
  market_snapshot: MarketSnapshot;
  signals: Signal[];
  alpha_summary: string;
  risk_assessment: RiskAssessment;
  yield_opportunity: YieldData | null;
  data_sources: {
    prices: { btc: TokenPrices; stx: TokenPrices };
    sentiment: SentimentData;
    whale_activity: WhaleActivity;
  };
}

export interface AggregatedData {
  prices: { btc: TokenPrices; stx: TokenPrices };
  sentiment: SentimentData;
  yield: YieldData;
  whales: WhaleActivity;
  fearGreed: { value: number; label: string };
}

export type Bindings = {
  OPENAI_API_KEY?: string;
};
