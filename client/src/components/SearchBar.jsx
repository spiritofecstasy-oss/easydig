import { useEffect, useRef } from 'react';

export default function SearchBar({ value, onChange, onSearch, searching }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) {
      onSearch('');
      return undefined;
    }
    timerRef.current = setTimeout(() => onSearch(value.trim()), 350);
    return () => clearTimeout(timerRef.current);
  }, [value, onSearch]);

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search for an artist…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {searching && <span className="spinner-text">Searching…</span>}
    </div>
  );
}
