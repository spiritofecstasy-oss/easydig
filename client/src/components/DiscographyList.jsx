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

      <ul className="release-list">
        {releases.map((r) => {
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
              </div>
              {isResolvingNow && <span className="badge loading">loading…</span>}
              {!isResolvingNow && !r.resolved && <span className="badge">…</span>}
              {!isResolvingNow && confirmedNoVideo && (
                <span className="badge muted">no video</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
