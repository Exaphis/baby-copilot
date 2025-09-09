// Simple sum implementation
export function sum(a: number, b: number) {
  return a + b
}

export function fib(n: number): number {
  if (n <= 1) return n;
  return fib(n-1) + fib(n-2);
}
