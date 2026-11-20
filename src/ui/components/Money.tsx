/** Dollar amount with the cents in a muted colour. */
export function Money({ value, className = '' }: { value: number; className?: string }) {
  const [whole, cents] = value
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split('.');
  return (
    <span className={`money ${className}`}>
      ${whole}
      <span className="cents">.{cents}</span>
    </span>
  );
}
