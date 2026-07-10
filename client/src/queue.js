export function buildQueue(releases) {
  const queue = [];
  releases.forEach((release) => {
    (release.videos || []).forEach((v, vi) => {
      queue.push({
        key: `${release.id}-${vi}`,
        releaseId: release.id,
        releaseTitle: release.title,
        year: release.year,
        videoTitle: v.title,
        youtubeId: v.youtubeId,
        isFirstOfRelease: vi === 0,
      });
    });
  });
  return queue;
}
