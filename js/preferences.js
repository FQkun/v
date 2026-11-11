VideoPlayer.prototype.loadPreferences = function() {
    const savedSpeed = localStorage.getItem('playbackSpeed');
    if (savedSpeed) {
        this.userSelectedSpeed = parseFloat(savedSpeed);
        this.currentPlaybackSpeed = this.userSelectedSpeed;
    }
    const savedMode = localStorage.getItem('playMode');
    if (savedMode) this.playMode = savedMode;
    const savedAutoScroll = localStorage.getItem('autoScroll');
    if (savedAutoScroll !== null) this.autoScroll = savedAutoScroll === 'true';
};

VideoPlayer.prototype.savePreferences = function() {
    localStorage.setItem('playbackSpeed', this.userSelectedSpeed);
    localStorage.setItem('playMode', this.playMode);
    localStorage.setItem('autoScroll', this.autoScroll);
};

VideoPlayer.prototype.updateUIFromPreferences = function() {
    if (this.autoScrollToggle) this.autoScrollToggle.checked = this.autoScroll;
    this.updatePlayModeUI();
    this.speedButtons.forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.speed) === this.userSelectedSpeed);
    });
};
