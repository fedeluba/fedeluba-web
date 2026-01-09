import { d as data } from '../../chunks/finances_DWB-0bma.mjs';
export { renderers } from '../../renderers.mjs';

const prerender = false;
let cache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL = 60 * 60 * 1e3;
async function fetchCoinGeckoPrices(ids) {
  if (ids.length === 0) return {};
  const uniqueIds = [...new Set(ids)];
  const idsParam = uniqueIds.join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("CoinGecko API error:", response.status);
      return {};
    }
    return await response.json();
  } catch (error) {
    console.error("CoinGecko fetch error:", error);
    return {};
  }
}
async function fetchDexscreenerPrice(contract, chain) {
  const chainMap = {
    ethereum: "ethereum",
    solana: "solana",
    base: "base",
    arbitrum: "arbitrum",
    polygon: "polygon",
    bsc: "bsc",
    avalanche: "avalanche",
    optimism: "optimism"
  };
  const chainId = chainMap[chain.toLowerCase()] || chain;
  const url = `https://api.dexscreener.com/latest/dex/tokens/${contract}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const pair = data.pairs?.find((p) => p.chainId === chainId);
    return pair ? parseFloat(pair.priceUsd) : null;
  } catch (error) {
    console.error("Dexscreener fetch error:", error);
    return null;
  }
}
const symbolToId = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
  ARB: "arbitrum",
  OP: "optimism"
};
function isGroupedHolding(holding) {
  return "group" in holding && "tokens" in holding;
}
async function calculatePortfolio() {
  const holdings = data.holdings;
  const assets = [];
  const coinGeckoIds = [];
  const coinGeckoHoldings = [];
  const dexscreenerHoldings = [];
  const stablecoinHoldings = [];
  const groupedDexscreener = /* @__PURE__ */ new Map();
  for (const holding of holdings) {
    if (isGroupedHolding(holding)) {
      if (holding.stablecoin) {
        stablecoinHoldings.push({ holding });
      } else {
        const dexTokens = [];
        for (const token of holding.tokens) {
          if (token.contract && token.chain) {
            dexTokens.push(token);
          } else {
            const id = symbolToId[token.symbol?.toUpperCase() || ""] || token.symbol?.toLowerCase();
            if (id) {
              coinGeckoIds.push(id);
            }
          }
        }
        if (dexTokens.length > 0) {
          groupedDexscreener.set(holding.group, { tokens: dexTokens, groupName: holding.group });
        }
      }
    } else {
      if (holding.stablecoin) {
        stablecoinHoldings.push({ holding });
      } else if (holding.contract && holding.chain) {
        dexscreenerHoldings.push({ token: holding });
      } else {
        const id = holding.id || symbolToId[holding.symbol?.toUpperCase() || ""] || holding.symbol?.toLowerCase();
        if (id) {
          coinGeckoIds.push(id);
          coinGeckoHoldings.push({ holding, id });
        }
      }
    }
  }
  const cgPrices = await fetchCoinGeckoPrices(coinGeckoIds);
  for (const { holding, id } of coinGeckoHoldings) {
    const price = cgPrices[id]?.usd || 0;
    const value = holding.amount * price;
    assets.push({
      symbol: holding.symbol || id.toUpperCase(),
      amount: holding.amount,
      price,
      value
    });
  }
  for (const { token } of dexscreenerHoldings) {
    if ("contract" in token && token.contract && "chain" in token && token.chain) {
      const price = await fetchDexscreenerPrice(token.contract, token.chain);
      const value = token.amount * (price || 0);
      assets.push({
        symbol: token.symbol || "UNKNOWN",
        amount: token.amount,
        price: price || 0,
        value
      });
    }
  }
  for (const [groupName, { tokens }] of groupedDexscreener) {
    let totalValue2 = 0;
    let totalAmount = 0;
    for (const token of tokens) {
      if (token.contract && token.chain) {
        const price = await fetchDexscreenerPrice(token.contract, token.chain);
        totalValue2 += token.amount * (price || 0);
        totalAmount += token.amount;
      }
    }
    assets.push({
      symbol: groupName,
      amount: totalAmount,
      price: totalAmount > 0 ? totalValue2 / totalAmount : 0,
      value: totalValue2,
      isGroup: true
    });
  }
  for (const { holding } of stablecoinHoldings) {
    if (isGroupedHolding(holding)) {
      const totalAmount = holding.tokens.reduce((sum, t) => sum + t.amount, 0);
      assets.push({
        symbol: holding.group,
        amount: totalAmount,
        price: 1,
        value: totalAmount,
        isGroup: true
      });
    } else {
      assets.push({
        symbol: holding.symbol || "STABLE",
        amount: holding.amount,
        price: 1,
        value: holding.amount
      });
    }
  }
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
  for (const asset of assets) {
    asset.percentage = totalValue > 0 ? asset.value / totalValue * 100 : 0;
  }
  assets.sort((a, b) => b.value - a.value);
  return {
    totalValue,
    assets,
    lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
    cached: false
  };
}
const GET = async () => {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) {
    return new Response(JSON.stringify({ ...cache.data, cached: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600"
      }
    });
  }
  try {
    const portfolio = await calculatePortfolio();
    cache = {
      data: portfolio,
      timestamp: now
    };
    return new Response(JSON.stringify(portfolio), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error) {
    console.error("Portfolio calculation error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch portfolio data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
