import YouTube from 'react-youtube';

export default function Player({ queue, currentIndex, onNext, onPrev }) {
  const current = queue[currentIndex];

  if (!current) {
    return (
      <section className="player empty">
        <p>
          No videos resolved yet. Once releases finish resolving, playback
          controls will appear here.
        </p>
      </section>
    );
  }

  const opts = {
    width: '100%',
    height: '100%',
    playerVars: { autoplay: 1 },
  };

  return (
    <section className="player">
      <div className="video-wrapper">
        <YouTube
          key={current.youtubeId}
          videoId={current.youtubeId}
          opts={opts}
          className="video-embed"
          iframeClassName="video-iframe"
          onEnd={onNext}
          onError={onNext}
        />
      </div>
      <div className="now-playing">
        <div className="now-playing-title">{current.releaseTitle}</div>
        <div className="now-playing-sub">{current.videoTitle}</div>
        <div className="now-playing-position">
          Track {currentIndex + 1} of {queue.length}
        </div>
      </div>
      <div className="player-controls">
        <button onClick={onPrev} disabled={currentIndex === 0}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Prev
        </button>
        <button onClick={onNext} disabled={currentIndex === queue.length - 1}>
          Next
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
