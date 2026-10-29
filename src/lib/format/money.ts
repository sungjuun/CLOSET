const wonNumber = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

// Keep existing amount precision, including averages such as cost per wear.
export function formatWon(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${wonNumber.format(value)}원`;
}
