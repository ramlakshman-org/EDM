// Shared reusable Pagination component.
// Shows: ← Prev | 1 … 5 [6] 7 … 599 | Next →
export default function Pagination({ page, total, pageSize, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  // Build page number window: always show first, last, current ±2, with ellipsis
  const makePages = () => {
    const items = [];
    const delta = 2;
    const left = page - delta;
    const right = page + delta;

    let prev = null;
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || (p >= left && p <= right)) {
        if (prev !== null && p - prev > 1) items.push('...');
        items.push(p);
        prev = p;
      }
    }
    return items;
  };

  const items = makePages();

  return (
    <div className="pager">
      <div className="pager-controls" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          className="pager-arrow"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹ Prev
        </button>

        {items.map((item, i) =>
          item === '...'
            ? <span key={`e-${i}`} className="pager-ellipsis">…</span>
            : (
              <button
                key={item}
                className={`pager-btn${item === page ? ' active' : ''}`}
                onClick={() => item !== page && onPage(item)}
              >
                {item}
              </button>
            )
        )}

        <button
          className="pager-arrow"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next ›
        </button>
      </div>

      <span className="pager-info">{total.toLocaleString('en-IN')} records</span>
    </div>
  );
}
