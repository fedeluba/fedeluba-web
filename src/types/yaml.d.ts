declare module '*.yaml' {
  const data: any;
  export default data;
}

declare module '*/snapshots.yaml' {
  interface SnapshotAsset {
    symbol: string;
    amount: number;
    price: number;
    value: number;
    percentage: number;
    isGroup?: boolean;
    color?: string;
  }

  interface Snapshot {
    capturedAt: string;
    isFirst?: boolean;
    totalValue: number;
    assets: SnapshotAsset[];
  }

  interface SnapshotsData {
    [month: string]: Snapshot;
  }

  const data: SnapshotsData;
  export default data;
}

declare module '*/finances.yaml' {
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

  interface HistoryEntry {
    month: string;
    amount: number;
  }

  interface FinancesData {
    currency: string;
    goal: number;
    holdings: Holding[];
    history: HistoryEntry[];
  }

  const data: FinancesData;
  export default data;
}
