import { useState } from 'react';

interface PanelProps {
  title: string;
  items: string[];
}

/** Renders a collapsible panel of items. */
export function Panel({ title, items }: PanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel" onClick={() => setOpen(!open)}>
      <h2>{title}</h2>
      {open && (
        <ul>
          {items.map((item) => (
            <li key={item}>{format(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function format(value: string): string {
  return value.trim();
}

export const Badge = ({ count }: { count: number }) => <span>{count}</span>;
