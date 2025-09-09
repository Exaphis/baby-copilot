// Sum with validation + faster fib
export function sum(a: number, b: number) {
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('NaN');
  return a + b
}

export function fib(n: number): number {
  const dp = [0,1];
  for (let i=2;i<=n;i++) dp[i]=dp[i-1]+dp[i-2];
  return dp[n];
}
