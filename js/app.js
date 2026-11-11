class VideoPlayer {
    constructor() {
        this.videoScrollContainer = document.getElementById('videoScrollContainer');
        this.initialPrompt = document.getElementById('initialPrompt');
        this.importBtn = document.getElementById('importBtn');
        this.sidebar = document.querySelector('.sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.menuToggle = document.getElementById('menuToggle');
        this.mobileMenuToggle = document.getElementById('mobileMenuToggle');
        this.sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
        this.selectFolderBtn = document.getElementById('selectFolderBtn');
        this.distractionFreeToggle = document.getElementById('distractionFreeToggle');
        this.playbackCompleteModal = document.getElementById('playbackCompleteModal');
        this.replayBtn = document.getElementById('replayBtn');
        this.closePlaybackBtn = document.getElementById('closePlaybackBtn');
        this.speedButtons = document.querySelectorAll('.speed-btn');
        this.loadingStatus = document.getElementById('loadingStatus');
        this.loadingText = document.getElementById('loadingText');
        this.loadingProgress = document.getElementById('loadingProgress');
        this.unrestrictedModeCheckbox = document.getElementById('unrestrictedMode');
        this.autoScrollToggle = document.getElementById('autoScrollToggle');
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
        this.filterBar = document.getElementById('filterBar');
        this.filterLabel = document.getElementById('filterLabel');
        this.filterExitBtn = document.getElementById('filterExitBtn');
        this.searchMode = 'file';

        this.videos = [];
        this.playMode = 'random';
        this.autoScroll = true;
        this.baseOrder = [];
        this.playbackOrder = [];
        this.currentVideoIndex = 0;
        this.currentPlaybackSpeed = 1;
        this.userSelectedSpeed = 1;
        this.preLongPressSpeed = 1;
        this.isUnrestrictedMode = false;
        this.isDistractionFreeMode = false;
        this.needsUnmute = false;
        this.userPaused = false;
        this.activeTag = null;
        this.activeAuthor = null;
        this.searchIndex = [];
        this.searchTimer = null;
        this.searchActive = false;

        // 单音频引擎（唯一带声音的媒体元素，跨视频复用，避免每次新建元素被浏览器禁音）
        this.audioEngine = null;
        this.audioUrl = null;
        this.audioCurrentFile = null;
        this.audioBlocked = false;
        this.audioUnavailable = false;
        this.audioToken = 0;

        // 翻页状态
        this.items = new Map();
        this.animating = false;
        this.animTimer = null;
        this.dragOffsetY = 0;
        this.dragRaf = 0;

        // 手势状态
        this.gestureStartY = 0;
        this.gestureStartX = 0;
        this.gestureStartTime = 0;
        this.isDragging = false;
        this.lastTouchY = 0;
        this.lastTouchTime = 0;
        this.velocityY = 0;
        this.isLongPressing = false;
        this.longPressTimer = null;
        this.hasLongPressActionTriggered = false;
        this.suppressClickUntil = 0;
        this.preLongPressSpeed = 1;
        this.spaceDownAt = 0;
        this.spaceLongPressTimer = null;
        this.spaceLongPressTriggered = false;

        this.init();
    }

    init() {
        this.loadPreferences();
        this.setupToastContainer();
        this.setupAudioEngine();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.updateUIFromPreferences();
    }

    setupEventListeners() {
        this.setupMouseInteractions();

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        window.addEventListener('blur', () => this.cancelSpaceLongPress());
        this.videoScrollContainer.addEventListener('contextmenu', (e) => e.preventDefault());

        this.menuToggle.addEventListener('click', () => this.toggleSidebar());
        if (this.mobileMenuToggle) this.mobileMenuToggle.addEventListener('click', () => this.toggleSidebar());
        this.sidebarCloseBtn.addEventListener('click', () => this.toggleSidebar());
        this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar());
        this.importBtn.addEventListener('click', () => this.requestFolderAccess());
        this.selectFolderBtn.addEventListener('click', () => location.reload());
        this.distractionFreeToggle.addEventListener('change', () => this.toggleDistractionFreeMode());
        this.replayBtn.addEventListener('click', () => this.handleReplay());
        this.closePlaybackBtn.addEventListener('click', () => this.hidePlaybackComplete());
        if (this.filterExitBtn) this.filterExitBtn.addEventListener('click', () => this.exitFilter());

        if (this.autoScrollToggle) {
            this.autoScrollToggle.addEventListener('change', (e) => {
                this.autoScroll = e.target.checked;
                this.savePreferences();
                this.showToast('自动连播: ' + (this.autoScroll ? '已开启' : '已关闭'));
            });
        }

        this.playbackCompleteModal.addEventListener('click', (e) => {
            if (e.target === this.playbackCompleteModal) this.hidePlaybackComplete();
        });

        this.videoScrollContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.videoScrollContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.videoScrollContainer.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        this.videoScrollContainer.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));
        this.videoScrollContainer.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        this.searchInput.addEventListener('input', () => this.handleSearch());
        document.querySelectorAll('.search-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.search-mode-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.searchMode = e.currentTarget.dataset.mode;
                this.handleSearch(true);
            });
        });

        const appContainer = document.querySelector('.app-container');
        appContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
        appContainer.addEventListener('drop', async (e) => {
            e.preventDefault(); e.stopPropagation();
            const files = e.dataTransfer.files;
            if (files.length > 0) await this.loadVideosFromFolder(files);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden || this.userPaused) return;
            const video = this.getActiveVideo();
            if (video && video.paused && video.readyState > 0) {
                this.safePlay(video);
                const videoData = this.videos[this.playbackOrder[this.currentVideoIndex]];
                if (videoData) this.syncAudioEngine(video, videoData);
            }
        });

        let resizeRaf = 0;
        window.addEventListener('resize', () => {
            if (this.isDragging || this.animating) return;
            cancelAnimationFrame(resizeRaf);
            resizeRaf = requestAnimationFrame(() => this.positionNearItems(false));
        });
    }

    setupAudioEngine() {
        if (this.audioEngine) return;
        const container = document.querySelector('.app-container') || document.body;
        const engine = document.createElement('audio');
        engine.preload = 'auto';
        engine.muted = false;
        engine.volume = 1;
        // 仅用来出声，不参与画面渲染，避免和画面视频重复解码导致滑动卡顿
        engine.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:0;';
        engine.addEventListener('error', () => {
            if (!engine.getAttribute('src')) return;
            // 可能该视频没有音轨；保持静音即可，不能改回多元素出声（会再次触发自动禁音）
            this.audioBlocked = false;
            this.needsUnmute = false;
            this.hideAudioHint();
        });
        container.appendChild(engine);
        this.audioEngine = engine;
    }

    resetAudioEngine() {
        if (!this.audioEngine) return;
        this.audioToken++;
        try { this.audioEngine.pause(); } catch (error) {}
        if (this._audioMetaHandler) {
            this.audioEngine.removeEventListener('loadedmetadata', this._audioMetaHandler);
            this._audioMetaHandler = null;
        }
        if (this.audioUrl) {
            URL.revokeObjectURL(this.audioUrl);
            this.audioUrl = null;
        }
        this.audioCurrentFile = null;
        this.audioBlocked = false;
        this.needsUnmute = false;
        this.audioEngine.removeAttribute('src');
        this.hideAudioHint();
    }

    syncAudioEngine(video, videoData, forcePlay = false) {
        const engine = this.audioEngine;
        if (!engine || !video || !videoData || !videoData.file) return;
        if (this.audioUnavailable) return;

        const sameFile = this.audioCurrentFile === videoData.file;

        if (!sameFile) {
            if (this._audioMetaHandler) {
                engine.removeEventListener('loadedmetadata', this._audioMetaHandler);
                this._audioMetaHandler = null;
            }
            this.audioToken++;
            const token = this.audioToken;
            this.audioCurrentFile = videoData.file;
            const oldUrl = this.audioUrl;
            const url = URL.createObjectURL(videoData.file);
            this.audioUrl = url;
            engine.src = url;
            engine.load();
            if (oldUrl) URL.revokeObjectURL(oldUrl);

            engine.playbackRate = video.playbackRate || 1;
            // 必须在用户手势调用栈内直接 play()，否则等 metadata 再播会被判为自动播放而禁音
            if (!video.paused || forcePlay) this.playAudioEngine(token);

            const startAfterMetadata = () => {
                this._audioMetaHandler = null;
                if (token !== this.audioToken) return;
                try {
                    const target = Math.min(
                        video.currentTime || 0,
                        Math.max(0, (engine.duration || 0) - 0.05)
                    );
                    engine.currentTime = target;
                } catch (error) {}
                engine.playbackRate = video.playbackRate || 1;
                if (!video.paused || forcePlay) this.playAudioEngine(token);
                else engine.pause();
            };
            this._audioMetaHandler = startAfterMetadata;
            engine.addEventListener('loadedmetadata', startAfterMetadata, { once: true });
            return;
        }

        try {
            if (Math.abs(engine.currentTime - (video.currentTime || 0)) > 0.35) {
                engine.currentTime = video.currentTime || 0;
            }
        } catch (error) {}
        engine.playbackRate = video.playbackRate || 1;
        if (!video.paused || forcePlay) this.playAudioEngine();
        else engine.pause();
    }

    playAudioEngine(token) {
        const engine = this.audioEngine;
        if (!engine || !engine.getAttribute('src') || this.audioUnavailable) return;
        const playPromise = engine.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => {
                if (token !== undefined && token !== this.audioToken) return;
                this.audioBlocked = false;
                this.needsUnmute = false;
                this.hideAudioHint();
            }).catch(() => {
                if (token !== undefined && token !== this.audioToken) return;
                this.handleAudioBlocked();
            });
        }
    }

    handleAudioBlocked() {
        this.audioBlocked = true;
        this.needsUnmute = true;
        this.showAudioHint();
    }

    fallbackToVideoAudio() {
        const video = this.getActiveVideo();
        if (!video) return;
        video.muted = false;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
                video.muted = true;
                this.needsUnmute = true;
                this.showAudioHint();
            });
        }
    }

    showAudioHint() {
        const video = this.getActiveVideo();
        const item = video ? video.parentElement : null;
        const indicator = item ? item.querySelector('.mute-indicator') : null;
        if (indicator) indicator.classList.add('show');
    }

    hideAudioHint() {
        if (!this.items) return;
        this.items.forEach(item => {
            const indicator = item.querySelector('.mute-indicator');
            if (indicator) indicator.classList.remove('show');
        });
    }

    pauseAudioEngine() {
        if (!this.audioEngine) return;
        try { this.audioEngine.pause(); } catch (error) {}
    }

    async requestFolderAccess() {
        try {
            document.querySelectorAll('.temp-file-input').forEach(el => el.remove());
            const input = document.createElement('input');
            input.type = 'file';
            input.className = 'temp-file-input';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.webkitdirectory = true;
            input.multiple = true;
            input.onchange = async (e) => {
                const files = e.target.files;
                if (files.length > 0) await this.loadVideosFromFolder(files);
                document.body.removeChild(input);
            };
            input.click();
        } catch (error) {
            console.log('用户取消了文件选择或浏览器不支持');
        }
    }

    parseFileName(fileName) {
        if (this.isUnrestrictedMode) return { id: '', author: '', title: '', date: '' };
        const pattern = /^\[(\d+)\]\[(.+?)\]\[(.+?)\]\[(.+?)\]\.mp4$/;
        const match = fileName.match(pattern);
        if (match) {
            return { id: match[1], author: this.formatDeviceName(match[2]), title: match[3], date: match[4] };
        }
        return { id: '', author: '未知', title: fileName.replace(/\.mp4$/i, ''), date: '未知' };
    }

    formatDeviceName(rawName) {
        if (!rawName) return '未知';
        const separators = [',', '_', '&', '/', '|', '，', '、', ' '];
        let name = rawName;
        let firstIndex = -1;
        for (const sep of separators) {
            const index = name.indexOf(sep);
            if (index !== -1 && (firstIndex === -1 || index < firstIndex)) firstIndex = index;
        }
        if (firstIndex !== -1) name = name.substring(0, firstIndex);
        return name.trim() || '未知';
    }

    async loadVideosFromFolder(files) {
        this.isUnrestrictedMode = this.unrestrictedModeCheckbox.checked;
        this.showToast('正在读取文件夹...');
        this.loadingStatus.style.display = 'flex';
        this.loadingProgress.textContent = '0%';

        try {
            this.videos = [];
            const BATCH_SIZE = 200;
            let processedCount = 0;
            const totalCount = files.length;

            this.loadingText.textContent = `正在扫描文件 0/${totalCount}`;

            for (let i = 0; i < totalCount; i++) {
                const file = files[i];
                if (file.name.toLowerCase().endsWith('.mp4')) {
                    try {
                        const metadata = this.parseFileName(file.name);
                        this.videos.push({ file, name: file.name, ...metadata, tags: [] });
                    } catch (fileError) {
                        console.error(`加载文件 ${file.name} 失败:`, fileError);
                    }
                }
                processedCount++;

                if (processedCount % BATCH_SIZE === 0) {
                    const progress = Math.round((processedCount / totalCount) * 100);
                    this.loadingText.textContent = `正在扫描文件 ${processedCount}/${totalCount}`;
                    this.loadingProgress.textContent = `${progress}%`;
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            if (this.videos.length === 0) throw new Error('文件夹中未找到视频文件');

            this.buildSearchIndex();
            this.activeTag = null;
            this.activeAuthor = null;
            this.searchActive = false;
            this.hideFilterBar();

            this.loadingProgress.textContent = '100%';
            this.loadingText.textContent = `加载完成，共 ${this.videos.length} 个视频`;

            this.generatePlaybackOrder();
            this.renderVideos(0);
            this.initialPrompt.classList.add('hidden');
        } catch (error) {
            this.showToast(error.message || '加载失败');
            this.loadingStatus.style.display = 'none';
        }
    }

    buildSearchIndex() {
        this.searchIndex = this.videos.map(video => {
            video.tags = this.extractTags(`${video.title || ''} ${video.name || ''}`);
            return [video.id, video.author, video.title, video.date, video.name, video.tags.join(' ')]
                .join(' ')
                .toLowerCase();
        });
    }

    extractTags(text) {
        const tags = [];
        if (!text) return tags;
        const re = /#([^\s#，。,.!！?？、;；:：()（）\[\]【】"'“”<>|]+)/g;
        let match;
        while ((match = re.exec(text))) {
            const tag = match[1];
            if (tag && !tags.includes(tag)) tags.push(tag);
        }
        return tags;
    }

    escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    buildTitleHtml(title) {
        if (!title) return '';
        const re = /#([^\s#，。,.!！?？、;；:：()（）\[\]【】"'“”<>|]+)/g;
        let html = '';
        let last = 0;
        let match;
        while ((match = re.exec(title))) {
            html += this.escapeHtml(title.slice(last, match.index));
            const tag = match[1];
            html += `<span class="hashtag" role="button" tabindex="0" data-tag="${this.escapeHtml(tag)}">#${this.escapeHtml(tag)}</span>`;
            last = match.index + match[0].length;
        }
        html += this.escapeHtml(title.slice(last));
        return html;
    }

    generatePlaybackOrder() {
        this.baseOrder = new Array(this.videos.length);
        for (let i = 0; i < this.videos.length; i++) this.baseOrder[i] = i;

        if (this.playMode !== 'sequential') {
            const seed = Math.floor(Date.now() / 1000);
            this.shuffleArray(this.baseOrder, seed);
        }
        this.playbackOrder = this.baseOrder.slice();
        this.currentVideoIndex = 0;
    }

    shuffleArray(array, seed) {
        let currentSeed = seed;
        for (let i = array.length - 1; i > 0; i--) {
            currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
            const j = currentSeed % (i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    getPageHeight() {
        return this.videoScrollContainer.clientHeight || window.innerHeight;
    }

    getItem(index) {
        let item = this.items.get(index);
        if (item && item.parentNode === this.videoScrollContainer) return item;

        item = document.createElement('div');
        item.className = 'video-item';
        item.dataset.index = String(index);
        item.style.transition = 'none';
        item.style.transform = `translate3d(0, ${(index - this.currentVideoIndex) * this.getPageHeight() + this.dragOffsetY}px, 0)`;
        this.videoScrollContainer.appendChild(item);
        this.items.set(index, item);
        return item;
    }

    ensureMounted(index) {
        if (index < 0 || index >= this.playbackOrder.length) return null;
        const item = this.getItem(index);
        if (!item.hasChildNodes()) {
            this.mountVideoItem(item, this.videos[this.playbackOrder[index]], index);
        }
        return item;
    }

    renderVideos(startIndex = 0, resume = null) {
        this.finishNavigation(true);
        this.resetAudioEngine();

        // 先释放所有 objectURL，再清空容器
        for (const item of this.items.values()) {
            const video = item.querySelector('video');
            if (video) this.unloadVideoSource(video);
            item.remove();
        }
        this.items.clear();

        if (this.playbackOrder.length === 0) return;

        this.currentVideoIndex = Math.max(0, Math.min(startIndex, this.playbackOrder.length - 1));
        const currentItem = this.ensureMounted(this.currentVideoIndex);
        if (!currentItem) return;

        this.positionNearItems(false);
        this.items.forEach((item, index) => {
            item.classList.toggle('active', index === this.currentVideoIndex);
        });

        const shouldResume = resume && resume.globalIndex === this.playbackOrder[this.currentVideoIndex];
        this.playItem(this.currentVideoIndex, shouldResume ? resume : null);
        this.preloadNeighbors(this.currentVideoIndex);
    }

    positionNearItems(animate, duration = 260) {
        const pageHeight = this.getPageHeight();
        const start = this.currentVideoIndex - 1;
        const end = this.currentVideoIndex + 1;

        for (let index = start; index <= end; index++) {
            const item = this.items.get(index);
            if (!item) continue;
            if (animate) {
                item.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            } else {
                item.style.transition = 'none';
            }
            const offset = (index - this.currentVideoIndex) * pageHeight;
            item.style.transform = `translate3d(0, ${offset}px, 0)`;
        }
    }

    scheduleDragPositions() {
        if (this.dragRaf) return;
        this.dragRaf = requestAnimationFrame(() => {
            this.dragRaf = 0;
            this.applyDragPositions();
        });
    }

    applyDragPositions() {
        const pageHeight = this.getPageHeight();
        const start = this.currentVideoIndex - 1;
        const end = this.currentVideoIndex + 1;
        for (let index = start; index <= end; index++) {
            const item = this.items.get(index);
            if (!item) continue;
            item.style.transition = 'none';
            const offset = (index - this.currentVideoIndex) * pageHeight + this.dragOffsetY;
            item.style.transform = `translate3d(0, ${offset}px, 0)`;
        }
    }

    finalizeNavigation() {
        this.animating = false;
        clearTimeout(this.animTimer);
        this.animTimer = null;
        this.dragOffsetY = 0;
        this.positionNearItems(false);
        this.cleanupFarItems();
        this.pauseNonCurrentVideos();
        // 等翻页动画结束后再起播，避免解码新视频时打断合成器动画
        this.playItem(this.currentVideoIndex);
        this.schedulePreload(this.currentVideoIndex);
    }

    finishNavigation(skipPlayback = false) {
        if (!this.animating) return;
        if (!skipPlayback) {
            this.finalizeNavigation();
            return;
        }
        this.animating = false;
        clearTimeout(this.animTimer);
        this.animTimer = null;
        this.dragOffsetY = 0;
        this.positionNearItems(false);
        this.cleanupFarItems();
        this.pauseNonCurrentVideos();
    }

    pauseNonCurrentVideos() {
        this.items.forEach((item, index) => {
            if (index === this.currentVideoIndex) return;
            const video = item.querySelector('video');
            if (video && !video.paused) video.pause();
        });
    }

    schedulePreload(index) {
        clearTimeout(this._preloadTimer);
        this._preloadTimer = setTimeout(() => {
            if (this.currentVideoIndex === index) this.preloadNeighbors(index);
        }, 120);
    }

    cleanupFarItems() {
        const keys = Array.from(this.items.keys());
        for (const index of keys) {
            if (Math.abs(index - this.currentVideoIndex) > 1) this.unmountItem(index);
        }
    }

    unmountItem(index) {
        const item = this.items.get(index);
        if (!item) return;
        const video = item.querySelector('video');
        if (video) this.unloadVideoSource(video);
        item.remove();
        this.items.delete(index);
    }

    mountVideoItem(videoItem, video, index) {
        if (videoItem.hasChildNodes()) return;

        const videoElement = document.createElement('video');
        videoElement.playsInline = true;
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        // 关闭浏览器原生画中画/投屏/下载等入口，减少自带浮层
        videoElement.disablePictureInPicture = true;
        videoElement.setAttribute('disablepictureinpicture', '');
        videoElement.disableRemotePlayback = true;
        videoElement.setAttribute('disableremoteplayback', '');
        videoElement.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
        // 画面视频始终静音，声音统一由单音频引擎负责，避免多元素被浏览器禁音
        videoElement.muted = true;
        videoElement.playbackRate = this.userSelectedSpeed || 1;
        videoElement.preload = 'auto';

        const rightActions = document.createElement('div');
        rightActions.className = 'right-actions';

        const speedBtn = document.createElement('button');
        speedBtn.className = 'action-btn-right speed-btn-right';
        speedBtn.innerHTML = `
            <div class="icon-container">
                <svg viewBox="0 0 24 24" fill="white">
                    <path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44z"/>
                    <path d="M10.5 9h3c.83 0 1.5.67 1.5 1.5v3c0 .83-.67 1.5-1.5 1.5h-3c-.83 0-1.5-.67-1.5-1.5v-3c0-.83.67-1.5 1.5-1.5zm.5 4h2v-2h-2v2z"/>
                </svg>
            </div>
            <span class="action-label action-label-speed">${this.userSelectedSpeed || 1}x</span>
        `;
        rightActions.appendChild(speedBtn);

        const videoInfo = document.createElement('div');
        videoInfo.className = 'video-info-overlay';
        if (!this.isUnrestrictedMode) {
            videoInfo.innerHTML = `
                <div class="author" role="button" tabindex="0" data-author="${this.escapeHtml(video.author)}">@${this.escapeHtml(video.author)}</div>
                <div class="title">${this.buildTitleHtml(video.title)}</div>
                <div class="date">${this.escapeHtml(video.date)}</div>
            `;
        } else {
            videoInfo.innerHTML = `<div class="title">${this.escapeHtml(video.name)}</div>`;
            videoInfo.style.display = 'none';
        }

        videoInfo.addEventListener('click', (e) => {
            const authorEl = e.target.closest('.author[data-author]');
            if (authorEl) {
                e.preventDefault();
                e.stopPropagation();
                this.enterAuthor(authorEl.dataset.author);
                return;
            }
            const tagEl = e.target.closest('.hashtag');
            if (tagEl) {
                e.preventDefault();
                e.stopPropagation();
                this.enterTag(tagEl.dataset.tag);
            }
        });

        videoInfo.addEventListener('keydown', (e) => {
            const authorEl = e.target.closest('.author[data-author]');
            if (authorEl && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.stopPropagation();
                this.enterAuthor(authorEl.dataset.author);
                return;
            }
            const tagEl = e.target.closest('.hashtag');
            if (tagEl && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.stopPropagation();
                this.enterTag(tagEl.dataset.tag);
            }
        });

        const bottomControls = document.createElement('div');
        bottomControls.className = 'bottom-controls';
        const progressBar = document.createElement('div');
        progressBar.className = 'bottom-progress-bar';
        const progress = document.createElement('div');
        progress.className = 'bottom-progress';
        progressBar.appendChild(progress);
        bottomControls.appendChild(progressBar);
        const timeDisplay = document.createElement('div');
        timeDisplay.className = 'time-display-floating';
        timeDisplay.style.display = 'none';
        bottomControls.appendChild(timeDisplay);

        const playIndicator = document.createElement('div');
        playIndicator.className = 'play-indicator';
        playIndicator.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;

        const muteIndicator = document.createElement('div');
        muteIndicator.className = 'mute-indicator';
        muteIndicator.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

        // 预创建倍速提示，避免第一次长按时临时插入 DOM 造成卡顿
        const speedIndicator = document.createElement('div');
        speedIndicator.className = 'speed-indicator';
        speedIndicator.textContent = '2x';

        const formatTime = (seconds) => {
            if (!isFinite(seconds)) seconds = 0;
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        videoElement.addEventListener('click', () => {
            if (Date.now() < this.suppressClickUntil) return;
            if (this.isDragging) return;
            if (this.needsUnmute) {
                this.tryUnmute();
                this.suppressClickUntil = Date.now() + 250;
                return;
            }
            this.togglePlay(videoElement, playIndicator);
        });

        let progressRaf = 0;
        videoElement.addEventListener('timeupdate', () => {
            if (progressRaf) return;
            progressRaf = requestAnimationFrame(() => {
                progressRaf = 0;
                if (videoElement.duration > 0) {
                    const progressPercent = (videoElement.currentTime / videoElement.duration) * 100;
                    progress.style.width = `${progressPercent}%`;
                }
            });
        });

        videoElement.addEventListener('ended', () => {
            const indexAtEnd = parseInt(videoItem.dataset.index, 10);
            this.handleVideoEnded(indexAtEnd);
        });

        const seekTo = (clientX) => {
            if (!videoElement.duration || !isFinite(videoElement.duration)) return;
            const rect = progressBar.getBoundingClientRect();
            if (rect.width === 0) return;
            let percent = (clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            videoElement.currentTime = percent * videoElement.duration;
            if (videoElement === this.getActiveVideo() && this.audioEngine) {
                try { this.audioEngine.currentTime = videoElement.currentTime; } catch (error) {}
            }
            const progressPercent = percent * 100;
            progress.style.width = `${progressPercent}%`;
            timeDisplay.textContent = formatTime(videoElement.currentTime);
            timeDisplay.style.display = 'block';
            timeDisplay.style.left = `${progressPercent}%`;
        };

        let seeking = false;
        bottomControls.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            seeking = true;
            if (bottomControls.setPointerCapture) {
                try { bottomControls.setPointerCapture(e.pointerId); } catch (err) {}
            }
            seekTo(e.clientX);
        });
        bottomControls.addEventListener('pointermove', (e) => {
            if (seeking) seekTo(e.clientX);
        });
        const endSeek = () => {
            if (!seeking) return;
            seeking = false;
            timeDisplay.style.display = 'none';
        };
        bottomControls.addEventListener('pointerup', endSeek);
        bottomControls.addEventListener('pointercancel', endSeek);

        speedBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showSpeedMenu(speedBtn, videoElement); });

        videoItem.appendChild(videoElement);
        videoItem.appendChild(rightActions);
        videoItem.appendChild(videoInfo);
        videoItem.appendChild(bottomControls);
        videoItem.appendChild(playIndicator);
        videoItem.appendChild(muteIndicator);
        videoItem.appendChild(speedIndicator);
    }

    getActiveItem() {
        return this.items.get(this.currentVideoIndex) || null;
    }

    getActiveVideo() {
        const item = this.getActiveItem();
        return item ? item.querySelector('video') : null;
    }

    getVideoAt(index) {
        const item = this.items.get(index);
        return item ? item.querySelector('video') : null;
    }

    isVideoAtEnd(video) {
        if (!video) return false;
        if (video.ended) return true;
        const duration = video.duration;
        return isFinite(duration) && duration > 0 && video.currentTime >= duration - 0.25;
    }

    // 已播完的视频回看时必须归零，否则一恢复播放就立刻再次触发 ended 被自动滑走
    rewindIfEnded(video) {
        if (!this.isVideoAtEnd(video)) return false;
        try {
            video.currentTime = 0;
        } catch (error) {}
        return true;
    }

    captureCurrentState() {
        const video = this.getActiveVideo();
        if (!video) return null;
        return {
            globalIndex: this.playbackOrder[this.currentVideoIndex],
            time: video.currentTime || 0
        };
    }

    playItem(index, resume = null) {
        const item = this.items.get(index);
        if (!item) return;
        const video = item.querySelector('video');
        const videoData = this.videos[this.playbackOrder[index]];
        if (!video || !videoData) return;

        this.applySpeed(video, this.userSelectedSpeed || 1, item);

        const rewound = this.rewindIfEnded(video);
        let startTime = 0;
        if (!rewound && resume && resume.globalIndex === this.playbackOrder[index] && resume.time > 0.5) {
            startTime = resume.time;
        } else if (!rewound && this.audioEngine && !this.audioEngine.paused && this.audioCurrentFile === videoData.file) {
            // 翻页时声音先起播，画面在动画结束后对齐到音频进度
            startTime = this.audioEngine.currentTime || 0;
        }

        if (startTime > 0.05) {
            const applyStartTime = () => {
                if (!isFinite(video.duration) || video.duration <= 0) return;
                try {
                    video.currentTime = Math.min(startTime, Math.max(0, video.duration - 0.2));
                } catch (err) {}
            };
            if (video.readyState >= 1) applyStartTime();
            else video.addEventListener('loadedmetadata', applyStartTime, { once: true });
        }

        if (!video.src || !video.src.startsWith('blob:')) {
            this.loadVideoSource(video, videoData);
        }
        this.safePlay(video);
        this.syncAudioEngine(video, videoData);
    }

    // Safari/iOS 修改 playbackRate 时会内部 seek，导致进度突然后退/前进几秒并卡一下；
    // 改速后在短窗口内多次比对“按新倍速本该到达的位置”，发现跳变就纠正。
    setPlaybackRate(target, rate) {
        if (!target) return;
        rate = rate || 1;
        if (Math.abs((target.playbackRate || 1) - rate) < 0.001) return;

        // 取消上一次改速留下的校正窗口，避免两次改速互相拉扯
        if (target._rateCorrection) target._rateCorrection();

        const wasPlaying = !target.paused && !target.ended;
        const before = target.currentTime || 0;
        const changedAt = performance.now();

        target.playbackRate = rate;
        if (!wasPlaying) return;

        let correcting = false;
        let stopped = false;
        const timers = [];

        const expectedTime = () => {
            const elapsed = (performance.now() - changedAt) / 1000;
            const expected = before + elapsed * rate;
            const duration = target.duration;
            const limit = isFinite(duration) && duration > 0 ? Math.max(0, duration - 0.1) : expected;
            return Math.max(0, Math.min(expected, limit));
        };

        const correct = () => {
            if (stopped || correcting || target.paused || target.ended) return;
            const wanted = expectedTime();
            if (Math.abs((target.currentTime || 0) - wanted) > 0.75) {
                correcting = true;
                try { target.currentTime = wanted; } catch (error) {}
                setTimeout(() => { correcting = false; }, 200);
            }
        };

        const stop = () => {
            stopped = true;
            timers.forEach(clearTimeout);
            target.removeEventListener('seeked', correct);
            if (target._rateCorrection === stop) target._rateCorrection = null;
        };
        target._rateCorrection = stop;

        // WebKit 的内部 seek 可能延迟落地，多检查几个时间点
        [60, 180, 380, 700].forEach(delay => timers.push(setTimeout(correct, delay)));
        timers.push(setTimeout(stop, 1100));
        target.addEventListener('seeked', correct);
    }

    applySpeed(video, speed, item) {
        this.setPlaybackRate(video, speed);
        this.currentPlaybackSpeed = speed;
        if (this.audioEngine && video === this.getActiveVideo()) {
            this.setPlaybackRate(this.audioEngine, speed);
        }
        if (item) {
            const label = item.querySelector('.action-label-speed');
            if (label) label.textContent = `${speed}x`;
        }
    }

    safePlay(video) {
        if (!video) return;
        this.userPaused = false;
        this.setPlaybackRate(video, this.userSelectedSpeed || video.playbackRate || 1);

        // 音频引擎不可用时（例如无音轨/格式不支持），退回画面上直接出声
        if (this.audioUnavailable) {
            video.muted = false;
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    video.muted = true;
                    this.needsUnmute = true;
                    this.showAudioHint();
                    video.play().catch(() => {});
                });
            }
            return;
        }

        // 画面元素始终静音，声音由单音频引擎输出
        video.muted = true;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
                video.muted = true;
                video.play().catch(() => {});
            });
        }
    }

    tryUnmute() {
        if (!this.audioBlocked && !this.needsUnmute) return;
        this.suppressClickUntil = Math.max(this.suppressClickUntil, Date.now() + 250);
        const video = this.getActiveVideo();
        const videoData = this.videos[this.playbackOrder[this.currentVideoIndex]];
        if (this.audioUnavailable) {
            if (video) this.fallbackToVideoAudio();
            return;
        }
        if (this.audioEngine) this.audioEngine.muted = false;
        if (video && videoData) {
            if (video.paused) this.safePlay(video);
            this.syncAudioEngine(video, videoData);
        }
    }

    togglePlay(videoElement, playIndicator) {
        if (!videoElement) return;
        if (videoElement.paused) {
            this.userPaused = false;
            this.safePlay(videoElement);
            const videoData = this.videos[this.playbackOrder[this.currentVideoIndex]];
            if (videoData) this.syncAudioEngine(videoElement, videoData);
            if (playIndicator) playIndicator.classList.remove('show');
        } else {
            this.userPaused = true;
            videoElement.pause();
            this.pauseAudioEngine();
            if (playIndicator) {
                playIndicator.classList.add('show');
                setTimeout(() => playIndicator.classList.remove('show'), 260);
            }
        }
    }

    navigateTo(newIndex) {
        const total = this.playbackOrder.length;
        if (total === 0) return;

        if (newIndex < 0 || newIndex >= total) {
            this.snapBack();
            return;
        }
        if (this.animating) this.finishNavigation(true);

        const oldIndex = this.currentVideoIndex;
        if (newIndex === oldIndex) { this.snapBack(); return; }

        const targetExisted = this.items.has(newIndex);

        // 提前挂载目标页与相邻页，避免翻页时露出空白
        this.ensureMounted(newIndex);
        this.ensureMounted(newIndex - 1);
        this.ensureMounted(newIndex + 1);

        const oldItem = this.items.get(oldIndex);
        if (oldItem) oldItem.classList.remove('active');
        this.pauseAudioEngine();

        this.currentVideoIndex = newIndex;
        this.items.forEach((item, index) => item.classList.toggle('active', index === newIndex));

        const targetItem = this.items.get(newIndex);
        // 仅新挂载的目标页需要一次布局，已预加载的相邻页直接复用已提交位置
        if (targetItem && !targetExisted) void targetItem.offsetHeight;

        this.dragOffsetY = 0;
        this.animating = true;
        this.positionNearItems(true, 240);

        // 动画样式已提交；音频仍在本手势调用栈内起播，画面等动画结束后再起播并对齐
        const targetVideo = targetItem ? targetItem.querySelector('video') : null;
        const targetData = this.videos[this.playbackOrder[newIndex]];
        // 目标视频已播完时先归零，避免音频引擎对齐到末尾、画面起播即结束
        if (targetVideo) this.rewindIfEnded(targetVideo);
        if (targetVideo && targetData) this.syncAudioEngine(targetVideo, targetData, true);

        // 先让 240ms 合成器翻页动画独立跑完，再做解码与起播，避免滑动中卡顿
        clearTimeout(this.animTimer);
        this.animTimer = setTimeout(() => this.finalizeNavigation(), 250);
    }

    snapBack() {
        this.dragOffsetY = 0;
        this.animating = true;
        this.positionNearItems(true, 220);
        clearTimeout(this.animTimer);
        this.animTimer = setTimeout(() => {
            this.animating = false;
            this.animTimer = null;
            this.positionNearItems(false);
        }, 230);
    }

    navigateUp() {
        this.navigateTo(this.currentVideoIndex - 1);
    }

    navigateDown() {
        this.navigateTo(this.currentVideoIndex + 1);
    }

    startLongPress() {
        if (this.hasLongPressActionTriggered) return;
        const video = this.getActiveVideo();
        if (!video) return;
        this.preLongPressSpeed = this.userSelectedSpeed || video.playbackRate || 1;
        this.setPlaybackRate(video, 2);
        if (this.audioEngine) this.setPlaybackRate(this.audioEngine, 2);
        this.currentPlaybackSpeed = 2;
        this.hasLongPressActionTriggered = true;
        this.isLongPressing = false;
        this.showSpeedIndicator(video.parentElement, true);
        if (navigator.vibrate) {
            try { navigator.vibrate(10); } catch (err) {}
        }
    }

    endLongPress() {
        if (!this.hasLongPressActionTriggered) return;
        const video = this.getActiveVideo();
        if (video) {
            const restoreSpeed = this.preLongPressSpeed || this.userSelectedSpeed || 1;
            this.setPlaybackRate(video, restoreSpeed);
            if (this.audioEngine) this.setPlaybackRate(this.audioEngine, restoreSpeed);
            this.currentPlaybackSpeed = restoreSpeed;
            this.showSpeedIndicator(video.parentElement, false);
        }
        this.hasLongPressActionTriggered = false;
        this.suppressClickUntil = Date.now() + 350;
    }

    handleVideoEnded(index) {
        if (index !== this.currentVideoIndex) return;
        const totalVideos = this.playbackOrder.length;

        if (this.currentVideoIndex >= totalVideos - 1) {
            if (this.autoScroll) this.showPlaybackComplete();
            else this.replayCurrent();
        } else if (this.autoScroll) {
            this.navigateTo(this.currentVideoIndex + 1);
        } else {
            this.replayCurrent();
        }
    }

    replayCurrent() {
        const video = this.getActiveVideo();
        if (!video) return;
        video.currentTime = 0;
        this.userPaused = false;
        this.safePlay(video);
        const videoData = this.videos[this.playbackOrder[this.currentVideoIndex]];
        if (videoData) this.syncAudioEngine(video, videoData);
    }

    seekBy(seconds) {
        const video = this.getActiveVideo();
        if (!video || !isFinite(video.duration) || video.duration <= 0) return;
        const target = Math.max(0, Math.min(video.duration - 0.1, video.currentTime + seconds));
        video.currentTime = target;
        const currentData = this.videos[this.playbackOrder[this.currentVideoIndex]];
        if (this.audioEngine && currentData && this.audioCurrentFile === currentData.file) {
            try { this.audioEngine.currentTime = target; } catch (error) {}
        }
    }

    applyPlaylist(ordered, preserveCurrent = true) {
        const previousGlobal = this.playbackOrder[this.currentVideoIndex];
        const resume = preserveCurrent ? this.captureCurrentState() : null;
        this.playbackOrder = ordered;
        let start = 0;
        if (preserveCurrent && previousGlobal !== undefined) {
            const found = ordered.indexOf(previousGlobal);
            if (found >= 0) start = found;
        }
        const shouldResume = resume && ordered[start] === resume.globalIndex;
        this.renderVideos(start, shouldResume ? resume : null);
        return start;
    }

    refreshPlaylist() {
        this.activeTag = null;
        this.searchActive = false;
        this.hideFilterBar();
        this.generatePlaybackOrder();
        this.renderVideos(0);
    }

    showPlaybackComplete() {
        this.playbackCompleteModal.classList.add('show');
    }

    hidePlaybackComplete() {
        this.playbackCompleteModal.classList.remove('show');
    }

    handleReplay() {
        this.hidePlaybackComplete();
        if (this.playMode === 'random') {
            this.generatePlaybackOrder();
        }
        this.renderVideos(0);
    }

    scrollToVideo(index) {
        this.navigateTo(index);
    }
}
