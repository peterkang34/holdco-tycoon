export function ScoreboardRow({
  label,
  values,
  highlight,
  colorFn,
}: {
  label: string;
  values: string[];
  highlight?: boolean;
  colorFn?: (value: string) => string;
}) {
  return (
    <tr className={`border-b border-white/5 ${highlight ? 'bg-white/5' : ''}`}>
      <td className="py-2 text-text-muted">{label}</td>
      {values.map((value, i) => (
        <td
          key={i}
          className={`py-2 text-right whitespace-nowrap ${colorFn ? colorFn(value) : 'text-text-primary'}`}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}
