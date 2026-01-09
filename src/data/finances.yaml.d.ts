declare module '*/finances.yaml' {
  const data: {
    currentInvestedMoney: number;
    currency: string;
    goal: number;
    history: { month: string; amount: number }[];
  };
  export default data;
}
