declare module '*.yaml' {
  const data: any;
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
