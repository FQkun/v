VideoPlayer.prototype.loadVideoSource = function(videoElement, videoData) {
    if (!videoData || !videoData.file) return Promise.resolve();
    if (videoElement.dataset.blobUrl) return Promise.resolve();
    try {
        const url = URL.createObjectURL(videoData.file);
        videoElement.dataset.blobUrl = url;
        videoElement.src = url;
        videoElement.load();
        return Promise.resolve();
    } catch (error) {
        console.error('Failed to load video source:', error);
        return Promise.resolve();
    }
};

VideoPlayer.prototype.unloadVideoSource = function(videoElement) {
    if (!videoElement) return;
    try {
        videoElement.pause();
    } catch (error) {}
    if (videoElement.dataset.blobUrl) {
        URL.revokeObjectURL(videoElement.dataset.blobUrl);
        delete videoElement.dataset.blobUrl;
    }
    if (videoElement.getAttribute('src')) {
        videoElement.removeAttribute('src');
        videoElement.load();
    }
};

VideoPlayer.prototype.preloadNeighbors = function(currentIndex) {
    const totalVideos = this.playbackOrder.length;

    [-1, 1].forEach(delta => {
        const index = currentIndex + delta;
        if (index < 0 || index >= totalVideos) return;

        const item = this.ensureMounted(index);
        if (!item) return;
        const video = item.querySelector('video');
        const videoData = this.videos[this.playbackOrder[index]];
        if (video && videoData) {
            video.preload = 'auto';
            this.loadVideoSource(video, videoData);
        }
    });

    const keys = Array.from(this.items.keys());
    keys.forEach(index => {
        if (Math.abs(index - currentIndex) > 1) this.unmountItem(index);
    });
};
