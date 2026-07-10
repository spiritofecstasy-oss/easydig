const CATEGORY_ORDER = ['Album', 'EP', 'Single', 'Compilation', 'Mixtape', 'Box Set', 'Other'];

function groupByCategory(releases) {
  const groups = new Map();
  for (const r of releases) {
    const cat = r.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(r);
  }
  return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => ({
    category: cat,
    items: groups.get(cat),
  }));
}

function formatPrice(price) {
  const symbol = price.currency === 'USD' ? '$' : `${price.currency} `;
  return `${symbol}${price.value.toFixed(2)}`;
}

export default function DiscographyList({
  entity,
  releases,
  job,
  includeAll,
  onIncludeAllChange,
  onRefresh,
  currentReleaseId,
  onSelectRelease,
  resolvingReleaseId,
}) {
  const progressPct =
    job.total > 0 ? Math.round((job.resolved / job.total) * 100) : 100;
  const isLabel = entity.type === 'label';
  const groups = groupByCategory(releases);

  return (
    <section className="discography">
      <div className="discography-header">
        {entity.thumb && (
          <img className="artist-thumb" src={entity.thumb} alt="" />
        )}
        <h2>{entity.name}</h2>
        {isLabel && <span className="entity-type-badge">Label</span>}
      </div>

      <div className="controls">
        {isLabel ? (
          <span />
        ) : (
          <label>
            <input
              type="checkbox"
              checked={includeAll}
              onChange={(e) => onIncludeAllChange(e.target.checked)}
            />
            Include compilations & appearances (slower)
          </label>
        )}
        <button onClick={onRefresh}>Refresh</button>
      </div>

      {job.status === 'resolving' && (
        <div className="progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span>
            {job.listComplete
              ? `Resolving ${job.resolved} of ${job.total} releases…`
              : `Finding releases… (${job.total} so far, resolving ${job.resolved})`}
          </span>
        </div>
      )}

      <div className="release-list">
        {groups.map(({ category, items }) => (
          <div key={category} className="release-group">
            <div className="release-group-header">
              {category}
              <span className="release-group-count">{items.length}</span>
            </div>
            <ul className="release-group-list">
              {items.map((r) => {
                const hasVideo = r.videos && r.videos.length > 0;
                const confirmedNoVideo = r.resolved && !hasVideo;
                const isCurrent = r.id === currentReleaseId;
                const isResolvingNow = resolvingReleaseId === r.id;
                return (
                  <li
                    key={r.id}
                    className={[
                      'release-row',
                      isCurrent ? 'current' : '',
                      confirmedNoVideo ? 'unavailable' : '',
                    ]
                      .join(' ')
                      .trim()}
                    onClick={() => !confirmedNoVideo && onSelectRelease(r.id)}
                  >
                    {r.thumb ? (
                      <img src={r.thumb} alt="" className="release-thumb" />
                    ) : (
                      <div className="release-thumb placeholder" />
                    )}
                    <div className="release-info">
                      <div className="release-title">{r.title}</div>
                      <div className="release-meta">
                        {r.artistName ? `${r.artistName} · ` : ''}
                        {r.year || '—'} · {r.format || r.role}
                      </div>
                      {r.priceResolved && r.lowestPrice && (
                        <div className="release-price">
                          <a
                            href={`https://www.discogs.com/sell/release/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            From {formatPrice(r.lowestPrice)} · {r.numForSale} for
                            sale ↗
                          </a>
                        </div>
                      )}
                    </div>
                    {isResolvingNow && (
                      <span className="badge loading">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </span>
                    )}
                    {!isResolvingNow && !r.resolved && <span className="badge">…</span>}
                    {!isResolvingNow && confirmedNoVideo && (
                      <span className="badge muted">no video</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
