# Fede's Personal Site

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Build for production
npm run snapshot  # Capture portfolio snapshot
```

## Content

### Add a New App

Create `content/apps/app-name.md`:

```yaml
---
title: "App Name"
description: "Short description"
url: "https://app.com"
image: "/images/apps/app-name.png"
stack: ["React", "TypeScript"]
featured: true
order: 1
---

Optional markdown content here.
```

Add the image to `public/images/apps/`.

### Add a New Project

Create `content/projects/project-name.md`:

```yaml
---
title: "Project Name"
description: "Short description"
url: "https://github.com/fedeluba/project"
image: "/images/projects/project-name.png"
stack: ["Flutter", "Dart"]
featured: true
order: 1
---
```

### Add a Monthly Update

**On the 1st of each month:**

1. Run `npm run snapshot` (or `npm run snapshot --first` for the very first one)
2. Create `content/updates/YYYY-month.md`:

```yaml
---
title: "January 2026 Update"
date: 2026-01-01
investedMoney: 1500
defiIncome: 230
highlights:
  - "First highlight"
  - "Second highlight"
---

Your monthly update content in markdown.
```

### Modify Holdings

Edit `src/data/finances.yaml`:

```yaml
holdings:
  # Individual coins
  - symbol: "ETH"
    amount: 2.5
  
  # Coin with custom CoinGecko ID
  - id: "solana"
    symbol: "SOL"
    amount: 25
  
  # Grouped stablecoins (valued at $1)
  - group: "STABLES"
    stablecoin: true
    tokens:
      - symbol: "USDC"
        amount: 3000
  
  # Grouped memecoins (fetched from Dexscreener)
  - group: "MEMES"
    tokens:
      - contract: "0x..."
        chain: "base"
        symbol: "TOKEN"
        amount: 5000
```

### Update History

Add monthly totals to `src/data/finances.yaml` under `history`:

```yaml
history:
  - month: "2026-01"
    amount: 50000
```
