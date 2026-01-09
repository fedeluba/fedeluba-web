#!/usr/bin/env npx tsx

/**
 * Portfolio Snapshot CLI
 * 
 * Usage:
 *   npm run snapshot          # Capture current month's snapshot
 *   npm run snapshot --first  # Mark as first snapshot (no comparison)
 *   npm run snapshot --month 2026-02  # Capture specific month
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const isFirst = args.includes('--first');
const monthIndex = args.indexOf('--month');
const customMonth = monthIndex !== -1 ? args[monthIndex + 1] : null;

// Get current month in YYYY-MM format
const now = new Date();
const currentMonth = customMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

console.log(`\n📸 Portfolio Snapshot Tool\n`);
console.log(`Month: ${currentMonth}`);
console.log(`First snapshot: ${isFirst ? 'Yes' : 'No'}\n`);

// Types
interface SingleHolding {
  symbol?: string;
  id?: string;
  contract?: string;
  chain?: string;
  amount: number;
  stablecoin?: boolean;
  color?: string;
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
  color?: string;
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
  color?: string;
}

interface Snapshot {
  capturedAt: string;
  isFirst?: boolean;
  totalValue: number;
  assets: PortfolioAsset[];
}

// Fetch prices from CoinGecko
async function fetchCoinGeckoPrices(ids: string[]): Promise<PriceData> {
  if (ids.length === 0) return {};
  
  const uniqueIds = [...new Set(ids)];
  const idsParam = uniqueIds.join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
  
  try {
    console.log(`  Fetching prices from CoinGecko for: ${uniqueIds.join(', ')}`);
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
async function fetchDexscreenerPrice(contract: string, chain: string, symbol?: string): Promise<number | null> {
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
    console.log(`  Fetching price from Dexscreener for: ${symbol || contract}`);
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

async function calculatePortfolio(holdings: Holding[]): Promise<{ totalValue: number; assets: PortfolioAsset[] }> {
  const assets: PortfolioAsset[] = [];
  
  // Collect all CoinGecko IDs needed
  const coinGeckoIds: string[] = [];
  const coinGeckoHoldings: { holding: SingleHolding; id: string }[] = [];
  const dexscreenerHoldings: { token: GroupToken | SingleHolding }[] = [];
  const stablecoinHoldings: { holding: SingleHolding | GroupedHolding }[] = [];
  const groupedDexscreener: Map<string, { tokens: GroupToken[]; groupName: string; color?: string }> = new Map();
  
  for (const holding of holdings) {
    if (isGroupedHolding(holding)) {
      if (holding.stablecoin) {
        stablecoinHoldings.push({ holding });
      } else {
        const dexTokens: GroupToken[] = [];
        
        for (const token of holding.tokens) {
          if (token.contract && token.chain) {
            dexTokens.push(token);
          } else {
            const id = symbolToId[token.symbol?.toUpperCase() || ''] || token.symbol?.toLowerCase();
            if (id) {
              coinGeckoIds.push(id);
            }
          }
        }
        
        if (dexTokens.length > 0) {
          groupedDexscreener.set(holding.group, { tokens: dexTokens, groupName: holding.group, color: holding.color });
        }
      }
    } else {
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
      color: holding.color,
    });
  }
  
  // Process single Dexscreener holdings
  for (const { token } of dexscreenerHoldings) {
    if ('contract' in token && token.contract && 'chain' in token && token.chain) {
      const price = await fetchDexscreenerPrice(token.contract, token.chain, token.symbol);
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
  for (const [groupName, { tokens, color }] of groupedDexscreener) {
    let totalValue = 0;
    let totalAmount = 0;
    
    for (const token of tokens) {
      if (token.contract && token.chain) {
        const price = await fetchDexscreenerPrice(token.contract, token.chain, token.symbol);
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
      color,
    });
  }
  
  // Process stablecoin holdings
  for (const { holding } of stablecoinHoldings) {
    if (isGroupedHolding(holding)) {
      const totalAmount = holding.tokens.reduce((sum, t) => sum + t.amount, 0);
      assets.push({
        symbol: holding.group,
        amount: totalAmount,
        price: 1,
        value: totalAmount,
        isGroup: true,
        color: holding.color,
      });
    } else {
      assets.push({
        symbol: holding.symbol || 'STABLE',
        amount: holding.amount,
        price: 1,
        value: holding.amount,
        color: holding.color,
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
  
  return { totalValue, assets };
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const financesPath = path.join(rootDir, 'src/data/finances.yaml');
  const snapshotsPath = path.join(rootDir, 'src/data/snapshots.yaml');
  
  // Read finances.yaml
  console.log('📂 Reading finances.yaml...');
  const financesContent = fs.readFileSync(financesPath, 'utf-8');
  const finances = yaml.parse(financesContent);
  
  // Read existing snapshots or create empty object
  let snapshots: Record<string, Snapshot> = {};
  if (fs.existsSync(snapshotsPath)) {
    const snapshotsContent = fs.readFileSync(snapshotsPath, 'utf-8');
    snapshots = yaml.parse(snapshotsContent) || {};
  }
  
  // Check if snapshot already exists for this month
  if (snapshots[currentMonth]) {
    console.log(`\n⚠️  Snapshot for ${currentMonth} already exists!`);
    console.log(`   Total value: $${snapshots[currentMonth].totalValue.toLocaleString()}`);
    console.log(`\n   Use --month YYYY-MM to specify a different month, or delete the existing snapshot first.\n`);
    process.exit(1);
  }
  
  // Calculate portfolio
  console.log('\n💰 Calculating portfolio...\n');
  const { totalValue, assets } = await calculatePortfolio(finances.holdings);
  
  // Round values for cleaner YAML
  const roundedAssets = assets.map(asset => ({
    symbol: asset.symbol,
    amount: asset.amount,
    price: Math.round(asset.price * 100) / 100,
    value: Math.round(asset.value * 100) / 100,
    percentage: Math.round((asset.percentage || 0) * 10) / 10,
    ...(asset.isGroup ? { isGroup: true } : {}),
  }));
  
  // Create snapshot
  const snapshot: Snapshot = {
    capturedAt: new Date().toISOString(),
    ...(isFirst ? { isFirst: true } : {}),
    totalValue: Math.round(totalValue * 100) / 100,
    assets: roundedAssets,
  };
  
  // Add to snapshots
  snapshots[currentMonth] = snapshot;
  
  // Sort snapshots by month (newest first for readability)
  const sortedSnapshots: Record<string, Snapshot> = {};
  Object.keys(snapshots)
    .sort((a, b) => b.localeCompare(a))
    .forEach(key => {
      sortedSnapshots[key] = snapshots[key];
    });
  
  // Write snapshots.yaml
  const yamlContent = `# Portfolio snapshots - captured on the 1st of each month
# Run \`npm run snapshot\` to add a new snapshot

${yaml.stringify(sortedSnapshots)}`;
  
  fs.writeFileSync(snapshotsPath, yamlContent);
  
  // Print summary
  console.log('\n✅ Snapshot captured successfully!\n');
  console.log(`   Month: ${currentMonth}`);
  console.log(`   Total Value: $${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`   Assets: ${assets.length}`);
  console.log('');
  
  console.log('   📊 Breakdown:');
  for (const asset of roundedAssets) {
    console.log(`      ${asset.symbol.padEnd(10)} ${asset.percentage.toFixed(1).padStart(5)}%  $${asset.value.toLocaleString()}`);
  }
  
  console.log(`\n   Saved to: ${snapshotsPath}\n`);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
