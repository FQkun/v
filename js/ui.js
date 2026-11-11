VideoPlayer.prototype.toggleSidebar = function() {
    const showing = this.sidebar.classList.contains('show');
    if (!showing) {
        const speedMenu = document.querySelector('.speed-menu');
        if (speedMenu) speedMenu.remove();
    }
    this.sidebar.classList.toggle('show', !showing);
    this.sidebarOverlay.classList.toggle('show', !showing);
};

VideoPlayer.prototype.toggleDistractionFreeMode = function() {
    this.isDistractionFreeMode = this.distractionFreeToggle.checked;
    if (this.isDistractionFreeMode) {
        document.body.classList.add('distraction-free-mode');
        this.sidebar.classList.remove('show');
        this.sidebarOverlay.classList.remove('show');
        this.showToast('专注模式已开启');
    } else {
        document.body.classList.remove('distraction-free-mode');
        this.showToast('专注模式已关闭');
    }
};

VideoPlayer.prototype.showSpeedMenu = function(speedBtn, videoElement) {
    const existingMenu = document.querySelector('.speed-menu');
    if (existingMenu) { existingMenu.remove(); return; }

    const menu = document.createElement('div');
    menu.className = 'speed-menu';
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
    speeds.forEach(speed => {
        const menuItem = document.createElement('div');
        menuItem.className = 'speed-menu-item';
        if (speed === this.userSelectedSpeed) menuItem.classList.add('active');
        menuItem.textContent = `${speed}x`;
        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            this.userSelectedSpeed = speed;
            this.applySpeed(videoElement, speed, this.getActiveItem());
            this.savePreferences();
            this.showToast(`播放速度: ${speed}x`);
            menu.remove();
        });
        menu.appendChild(menuItem);
    });

    const rect = speedBtn.getBoundingClientRect();
    menu.style.bottom = `${Math.max(12, window.innerHeight - rect.top)}px`;
    menu.style.right = '60px';
    menu.style.zIndex = '2000';
    document.body.appendChild(menu);

    const closeMenu = (e) => {
        if (!menu.contains(e.target) && !speedBtn.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
};

VideoPlayer.prototype.showSpeedIndicator = function(videoItem, show) {
    if (!videoItem) return;
    let indicator = videoItem.querySelector('.speed-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'speed-indicator';
        indicator.textContent = '2x';
        videoItem.appendChild(indicator);
    }
    clearTimeout(indicator._hideTimer);
    if (show) {
        indicator.classList.add('show');
        // 顶部提示只短暂显示，倍速本身持续生效，避免长时间遮挡画面
        indicator._hideTimer = setTimeout(() => indicator.classList.remove('show'), 1200);
    } else {
        indicator.classList.remove('show');
    }
};

// ---------------- 搜索 ----------------

VideoPlayer.prototype.handleSearch = function(immediate) {
    clearTimeout(this.searchTimer);
    if (immediate) {
        this.runSearch();
        return;
    }
    this.searchTimer = setTimeout(() => this.runSearch(), 120);
};

VideoPlayer.prototype.runSearch = function() {
    const query = this.searchInput.value.trim().toLowerCase();
    this.searchResults.innerHTML = '';

    if (!query) {
        if (this.searchActive) {
            this.searchActive = false;
            this.restoreFilteredView();
        }
        return;
    }

    if (this.videos.length === 0) return;

    const results = [];
    for (const globalIndex of this.baseOrder) {
        const video = this.videos[globalIndex];
        if (!video) continue;
        const matched = this.searchMode === 'file'
            ? (video.author || '').toLowerCase().includes(query)
            : (this.searchIndex[globalIndex] || '').includes(query);
        if (matched) results.push({ video, globalIndex });
    }

    this.searchActive = true;

    const header = document.createElement('div');
    header.className = 'search-results-header';
    const headerText = document.createElement('span');
    headerText.textContent = `${results.length} 个结果`;
    const clearBtn = document.createElement('button');
    clearBtn.className = 'search-clear-btn';
    clearBtn.setAttribute('aria-label', '清除搜索并恢复全部');
    clearBtn.textContent = '×';
    clearBtn.addEventListener('click', () => {
        this.searchInput.value = '';
        this.searchActive = false;
        this.searchResults.innerHTML = '';
        this.restoreFilteredView();
    });
    header.appendChild(headerText);
    header.appendChild(clearBtn);
    this.searchResults.appendChild(header);

    if (results.length === 0) {
        const noResult = document.createElement('div');
        noResult.style.cssText = 'color:var(--text-secondary);font-size:13px;padding:8px 0;';
        noResult.textContent = '无结果';
        this.searchResults.appendChild(noResult);
        return;
    }

    const renderLimit = 80;
    const renderResults = results.slice(0, renderLimit);

    renderResults.forEach(({ video, globalIndex }) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        const titleEl = document.createElement('div');
        titleEl.className = 'result-title';
        titleEl.textContent = video.title || video.name;
        const subEl = document.createElement('div');
        subEl.className = 'result-sub';
        subEl.textContent = `${video.author || ''} ${video.date || ''}`.trim();
        item.appendChild(titleEl);
        item.appendChild(subEl);

        item.addEventListener('click', () => {
            const ordered = results.map(r => r.globalIndex);
            const startPos = ordered.indexOf(globalIndex);
            const rotated = startPos >= 0
                ? [...ordered.slice(startPos), ...ordered.slice(0, startPos)]
                : ordered;

            this.activeTag = null;
            this.activeAuthor = null;
            this.searchActive = true;
            this.hideFilterBar();
            this.playbackOrder = rotated;
            this.currentVideoIndex = 0;
            this.renderVideos(0, null);
            this.toggleSidebar();
        });

        this.searchResults.appendChild(item);
    });

    if (results.length > renderLimit) {
        const more = document.createElement('div');
        more.style.cssText = 'color:var(--text-tertiary);font-size:12px;padding:8px 0;text-align:center;';
        more.textContent = `仅显示前 ${renderLimit} 条，请输入更精确的关键词`;
        this.searchResults.appendChild(more);
    }
};

VideoPlayer.prototype.restoreFilteredView = function() {
    if (this.activeTag) {
        const filtered = this.baseOrder.filter(globalIndex => {
            const video = this.videos[globalIndex];
            return video && video.tags && video.tags.includes(this.activeTag);
        });
        if (filtered.length > 0) {
            this.applyPlaylist(filtered, true);
            return;
        }
        this.exitFilter();
        return;
    }
    if (this.activeAuthor) {
        const filtered = this.baseOrder.filter(globalIndex => {
            const video = this.videos[globalIndex];
            return video && video.author === this.activeAuthor;
        });
        if (filtered.length > 0) {
            this.applyPlaylist(filtered, true);
            return;
        }
        this.exitFilter();
        return;
    }
    if (this.baseOrder.length > 0) this.applyPlaylist(this.baseOrder.slice(), true);
};

// ---------------- 标签 / 作者过滤 ----------------

VideoPlayer.prototype.enterTag = function(tag) {
    if (!tag) return;
    const filtered = this.baseOrder.filter(globalIndex => {
        const video = this.videos[globalIndex];
        return video && video.tags && video.tags.includes(tag);
    });

    if (filtered.length === 0) {
        this.showToast('该标签下暂无视频');
        return;
    }

    const speedMenu = document.querySelector('.speed-menu');
    if (speedMenu) speedMenu.remove();

    this.searchActive = false;
    this.searchInput.value = '';
    this.searchResults.innerHTML = '';
    this.activeTag = tag;
    this.activeAuthor = null;
    this.showFilterBar(`只看 #${tag} 的视频 · ${filtered.length} 个`, '退出');
    this.applyPlaylist(filtered, true);
};

VideoPlayer.prototype.enterAuthor = function(author) {
    if (!author) return;
    const filtered = this.baseOrder.filter(globalIndex => {
        const video = this.videos[globalIndex];
        return video && video.author === author;
    });

    if (filtered.length === 0) {
        this.showToast('该用户名下暂无视频');
        return;
    }

    const speedMenu = document.querySelector('.speed-menu');
    if (speedMenu) speedMenu.remove();

    this.searchActive = false;
    this.searchInput.value = '';
    this.searchResults.innerHTML = '';
    this.activeAuthor = author;
    this.activeTag = null;
    this.showFilterBar(`只看 @${author} 的视频 · ${filtered.length} 个`, '退出');
    this.applyPlaylist(filtered, true);
};

VideoPlayer.prototype.exitFilter = function() {
    if (!this.activeTag && !this.activeAuthor) return;
    const wasAuthor = Boolean(this.activeAuthor);
    this.activeTag = null;
    this.activeAuthor = null;
    this.hideFilterBar();
    this.searchActive = false;
    this.searchInput.value = '';
    this.searchResults.innerHTML = '';
    this.applyPlaylist(this.baseOrder.slice(), true);
    this.showToast(wasAuthor ? '已退出筛选，恢复全部视频' : '已退出标签，恢复全部视频');
};

VideoPlayer.prototype.showFilterBar = function(label, exitLabel) {
    if (!this.filterBar) return;
    this.filterLabel.textContent = label;
    this.filterExitBtn.textContent = exitLabel || '退出筛选';
    this.filterBar.classList.add('show');
};

VideoPlayer.prototype.hideFilterBar = function() {
    if (!this.filterBar) return;
    this.filterBar.classList.remove('show');
};

// ---------------- 其他 ----------------

VideoPlayer.prototype.registerServiceWorker = function() {
    if (!('serviceWorker' in navigator)) return;

    // 尽量申请持久化存储，降低系统清理缓存导致离线失效的概率（不支持则忽略）
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
    }

    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
        .then(registration => {
            if (registration && registration.update) registration.update();
        })
        .catch(error => console.log('ServiceWorker registration failed:', error));
};
