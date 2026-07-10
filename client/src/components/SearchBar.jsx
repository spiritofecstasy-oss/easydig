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
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        placeholder="Search an artist, label, or release…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {searching && <span className="spinner-text">Searching…</span>}
    </div>
  );
}
