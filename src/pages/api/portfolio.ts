export const prerender = false;

import type { APIRoute } from 'astro';
import financesData from '../../data/finances.yaml';

interface SingleHolding {
  symbol?: string;
  id?: string;
  contract?: string;
  chain?: string;
  amount: number;
  stablecoin?: boolean;
}

interface GroupToken {
  symbol?: string;
  contract?: string;
  chain?: string;
  amount: number;
}

interface GroupedHolding {
  group: string;
  stablecoin?: boolean;
  tokens: GroupToken[];
}

type Holding = SingleHolding | GroupedHolding;

interface PriceData {
  [key: string]: { usd: number };
}

interface PortfolioAsset {
  symbol: string;
  amount: number;
  price: number;
  value: number;
  percentage?: number;
  isGroup?: boolean;
}

interface PortfolioResponse {
  totalValue: number;
  assets: PortfolioAsset[];
  lastUpdated: string;
  cached: boolean;
}

// Simple in-memory cache
let cache: {
  data: PortfolioResponse | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Fetch prices from CoinGecko
async function fetchCoinGeckoPrices(ids: string[]): Promise<PriceData> {
  if (ids.length === 0) return {};
  
  const uniqueIds = [...new Set(ids)];
  const idsParam = uniqueIds.join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('CoinGecko API error:', response.status);
      return {};
    }
    return await response.json();
  } catch (error) {
    console.error('CoinGecko fetch error:', error);
    return {};
  }
}

// Fetch price from Dexscreener for custom tokens
async function fetchDexscreenerPrice(contract: string, chain: string): Promise<number | null> {
  const chainMap: Record<string, string> = {
    ethereum: 'ethereum',
    solana: 'solana',
    base: 'base',
    arbitrum: 'arbitrum',
    polygon: 'polygon',
    bsc: 'bsc',
    avalanche: 'avalanche',
    optimism: 'optimism',
  };
  
  const chainId = chainMap[chain.toLowerCase()] || chain;
  const url = `https://api.dexscreener.com/latest/dex/tokens/${contract}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    const pair = data.pairs?.find((p: any) => p.chainId === chainId);
    return pair ? parseFloat(pair.priceUsd) : null;
  } catch (error) {
    console.error('Dexscreener fetch error:', error);
    return null;
  }
}

// Map common symbols to CoinGecko IDs
const symbolToId: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  ARB: 'arbitrum',
  OP: 'optimism',
};

function isGroupedHolding(holding: Holding): holding is GroupedHolding {
  return 'group' in holding && 'tokens' in holding;
}

async function calculatePortfolio(): Promise<PortfolioResponse> {
  const holdings = financesData.holdings as Holding[];
  const assets: PortfolioAsset[] = [];
  
  // Collect all CoinGecko IDs needed
  const coinGeckoIds: string[] = [];
  const coinGeckoHoldings: { holding: SingleHolding; id: string }[] = [];
  const dexscreenerHoldings: { token: GroupToken | SingleHolding; groupName?: string }[] = [];
  const stablecoinHoldings: { holding: SingleHolding | GroupedHolding }[] = [];
  const groupedDexscreener: Map<string, { tokens: GroupToken[]; groupName: string }> = new Map();
  
  for (const holding of holdings) {
    if (isGroupedHolding(holding)) {
      // Grouped holding
      if (holding.stablecoin) {
        // Stablecoin group - all tokens valued at $1
        stablecoinHoldings.push({ holding });
      } else {
        // Non-stablecoin group (e.g., MEMES) - fetch prices for each token
        const dexTokens: GroupToken[] = [];
        
        for (const token of holding.tokens) {
          if (token.contract && token.chain) {
            dexTokens.push(token);
          } else {
            // Try CoinGecko for tokens without contract
            const id = symbolToId[token.symbol?.toUpperCase() || ''] || token.symbol?.toLowerCase();
            if (id) {
              coinGeckoIds.push(id);
              // We'll handle this separately
            }
          }
        }
        
        if (dexTokens.length > 0) {
          groupedDexscreener.set(holding.group, { tokens: dexTokens, groupName: holding.group });
        }
      }
    } else {
      // Single holding
      if (holding.stablecoin) {
        stablecoinHoldings.push({ holding });
      } else if (holding.contract && holding.chain) {
        dexscreenerHoldings.push({ token: holding });
      } else {
        const id = holding.id || symbolToId[holding.symbol?.toUpperCase() || ''] || holding.symbol?.toLowerCase();
        if (id) {
          coinGeckoIds.push(id);
          coinGeckoHoldings.push({ holding, id });
        }
      }
    }
  }
  
  // Fetch CoinGecko prices in one batch
  const cgPrices = await fetchCoinGeckoPrices(coinGeckoIds);
  
  // Process single CoinGecko holdings
  for (const { holding, id } of coinGeckoHoldings) {
    const price = cgPrices[id]?.usd || 0;
    const value = holding.amount * price;
    assets.push({
      symbol: holding.symbol || id.toUpperCase(),
      amount: holding.amount,
      price,
      value,
    });
  }
  
  // Process single Dexscreener holdings
  for (const { token } of dexscreenerHoldings) {
    if ('contract' in token && token.contract && 'chain' in token && token.chain) {
      const price = await fetchDexscreenerPrice(token.contract, token.chain);
      const value = token.amount * (price || 0);
      assets.push({
        symbol: token.symbol || 'UNKNOWN',
        amount: token.amount,
        price: price || 0,
        value,
      });
    }
  }
  
  // Process grouped Dexscreener holdings (e.g., MEMES)
  for (const [groupName, { tokens }] of groupedDexscreener) {
    let totalValue = 0;
    let totalAmount = 0;
    
    for (const token of tokens) {
      if (token.contract && token.chain) {
        const price = await fetchDexscreenerPrice(token.contract, token.chain);
        totalValue += token.amount * (price || 0);
        totalAmount += token.amount;
      }
    }
    
    assets.push({
      symbol: groupName,
      amount: totalAmount,
      price: totalAmount > 0 ? totalValue / totalAmount : 0,
      value: totalValue,
      isGroup: true,
    });
  }
  
  // Process stablecoin holdings (single and grouped)
  for (const { holding } of stablecoinHoldings) {
    if (isGroupedHolding(holding)) {
      // Grouped stablecoins
      const totalAmount = holding.tokens.reduce((sum, t) => sum + t.amount, 0);
      assets.push({
        symbol: holding.group,
        amount: totalAmount,
        price: 1,
        value: totalAmount,
        isGroup: true,
      });
    } else {
      // Single stablecoin
      assets.push({
        symbol: holding.symbol || 'STABLE',
        amount: holding.amount,
        price: 1,
        value: holding.amount,
      });
    }
  }
  
  // Calculate total and percentages
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
  
  for (const asset of assets) {
    asset.percentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0;
  }
  
  // Sort by value descending
  assets.sort((a, b) => b.value - a.value);
  
  return {
    totalValue,
    assets,
    lastUpdated: new Date().toISOString(),
    cached: false,
  };
}

export const GET: APIRoute = async () => {
  const now = Date.now();
  
  // Check cache
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return new Response(JSON.stringify({ ...cache.data, cached: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  
  try {
    const portfolio = await calculatePortfolio();
    
    // Update cache
    cache = {
      data: portfolio,
      timestamp: now,
    };
    
    return new Response(JSON.stringify(portfolio), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Portfolio calculation error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch portfolio data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
