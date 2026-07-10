import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SearchBar from './components/SearchBar.jsx';
import DiscographyList from './components/DiscographyList.jsx';
import Player from './components/Player.jsx';
import { buildQueue } from './queue.js';

export default function App() {
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [releases, setReleases] = useState([]);
  const [job, setJob] = useState({
    status: 'done',
    total: 0,
    resolved: 0,
    listComplete: true,
  });
  const [includeAll, setIncludeAll] = useState(false);
  // Identity of the current track (release id + position within it), not a
  // raw array index — the queue gets rebuilt as more releases resolve in the
  // background, which shifts numeric positions but never changes a track's key.
  const [currentKey, setCurrentKey] = useState(null);
  const pollRef = useRef(null);
  const latestQueryRef = useRef('');
  const headerRef = useRef(null);

  const queue = useMemo(() => buildQueue(releases), [releases]);
  const currentIndex = useMemo(
    () => queue.findIndex((item) => item.key === currentKey),
    [queue, currentKey]
  );

  useEffect(() => {
    if (currentIndex === -1 && queue.length > 0) {
      setCurrentKey(queue[0].key);
    }
  }, [currentIndex, queue]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchState = useCallback(
    async (type, id, includeAllFlag, refresh = false) => {
      const params = new URLSearchParams({ includeAll: String(includeAllFlag) });
      if (refresh) params.set('refresh', 'true');
      const res = await fetch(`/api/entity/${type}/${id}/state?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReleases(data.releases);
      setJob(data.job);
      return data.job;
    },
    []
  );

  const startPolling = useCallback(
    (type, id, includeAllFlag) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const j = await fetchState(type, id, includeAllFlag);
          if (j.status === 'done') stopPolling();
        } catch (err) {
          console.error(err);
          stopPolling();
        }
      }, 1200);
    },
    [fetchState, stopPolling]
  );

  useEffect(() => {
    if (!selectedEntity) return undefined;
    stopPolling();
    setCurrentKey(null);
    let cancelled = false;

    (async () => {
      try {
        const initialJob = await fetchState(
          selectedEntity.type,
          selectedEntity.id,
          includeAll
        );
        if (cancelled) return;
        if (initialJob.status !== 'done') {
          startPolling(selectedEntity.type, selectedEntity.id, includeAll);
        }
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntity, includeAll]);

  const handleSearch = useCallback(async (q) => {
    latestQueryRef.current = q;
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (latestQueryRef.current !== q) return; // a newer query superseded this one
      setSearchResults(data.results || []);
    } finally {
      if (latestQueryRef.current === q) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchResults.length === 0) return undefined;
    function handleClickOutside(e) {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setSearchResults([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchResults.length]);

  async function handleSelectResult(result) {
    setSearchValue('');
    setSearchResults([]);
    setResolveError(null);

    if (result.type === 'artist' || result.type === 'label') {
      setSelectedEntity(result);
      setReleases([]);
      return;
    }

    // A release/master isn't itself a "discography" — resolve to its
    // primary credited artist and load that instead.
    setResolving(true);
    try {
      const res = await fetch(`/api/resolve/${result.type}/${result.id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSelectedEntity(data);
      setReleases([]);
    } catch (err) {
      setResolveError(
        `Couldn't find an artist for "${result.name}": ${err.message}`
      );
    } finally {
      setResolving(false);
    }
  }

  function jumpToRelease(releaseId) {
    const item = queue.find((q) => q.releaseId === releaseId);
    if (item) setCurrentKey(item.key);
  }

  async function handleRefresh() {
    try {
      const j = await fetchState(
        selectedEntity.type,
        selectedEntity.id,
        includeAll,
        true
      );
      if (j.status !== 'done') {
        startPolling(selectedEntity.type, selectedEntity.id, includeAll);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function handleNext() {
    const nextItem = queue[Math.min(currentIndex + 1, queue.length - 1)];
    if (nextItem) setCurrentKey(nextItem.key);
  }
  function handlePrev() {
    const prevItem = queue[Math.max(currentIndex - 1, 0)];
    if (prevItem) setCurrentKey(prevItem.key);
  }

  return (
    <div className="app">
      <header className="app-header" ref={headerRef}>
        <div className="app-header-inner">
          <h1>Discogs → YouTube Discography Player</h1>
          <SearchBar
            value={searchValue}
            onChange={setSearchValue}
            onSearch={handleSearch}
            searching={searching || resolving}
          />
          {resolveError && <div className="resolve-error">{resolveError}</div>}
          {searchResults.length > 0 && (
            <ul className="search-results">
              {searchResults.map((r) => (
                <li
                  key={`${r.type}-${r.id}`}
                  onClick={() => handleSelectResult(r)}
                >
                  {r.thumb ? (
                    <img src={r.thumb} alt="" />
                  ) : (
                    <div className="result-thumb-placeholder" />
                  )}
                  <span className="result-name">{r.name}</span>
                  <span className="result-type">
                    {r.type}
                    {r.year ? ` · ${r.year}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {selectedEntity && (
        <main className="main-layout">
          <DiscographyList
            entity={selectedEntity}
            releases={releases}
            job={job}
            includeAll={includeAll}
            onIncludeAllChange={setIncludeAll}
            onRefresh={handleRefresh}
            currentReleaseId={queue[currentIndex]?.releaseId}
            onSelectRelease={jumpToRelease}
          />
          <Player
            queue={queue}
            currentIndex={currentIndex}
            onNext={handleNext}
            onPrev={handlePrev}
          />
        </main>
      )}
    </div>
  );
}
