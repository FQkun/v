VideoPlayer.prototype.setupMouseInteractions = function() {
    let mouseDown = false;
    let startY = 0;
    let dragging = false;
    let longPressTimer = null;

    const isInteractive = (target) => target.closest(
        '.bottom-controls, .right-actions, .speed-menu, .filter-bar, .top-bar, .sidebar, .hashtag, .author'
    );

    this.videoScrollContainer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (this.sidebar.classList.contains('show')) return;
        if (isInteractive(e.target)) return;
        if (this.animating) this.finishNavigation();

        this.tryUnmute();
        mouseDown = true;
        dragging = false;
        startY = e.clientY;
        this.gestureStartY = e.clientY;
        this.isDragging = false;
        this.dragOffsetY = 0;
        this.hasLongPressActionTriggered = false;

        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            if (!dragging && !this.isDragging && mouseDown) this.startLongPress();
        }, 250);
    });

    window.addEventListener('mousemove', (e) => {
        if (!mouseDown) return;
        if (this.hasLongPressActionTriggered) return;
        const deltaY = e.clientY - startY;
        if (!dragging && Math.abs(deltaY) > 8) {
            dragging = true;
            this.isDragging = true;
            clearTimeout(longPressTimer);
        }
        if (dragging) {
            this.dragOffsetY = this.clampDragOffset(deltaY);
            this.scheduleDragPositions();
        }
    });

    window.addEventListener('mouseup', () => {
        clearTimeout(longPressTimer);

        if (this.hasLongPressActionTriggered) {
            this.endLongPress();
            this.resetGestureState();
            mouseDown = false;
            return;
        }

        if (dragging) {
            const pageHeight = this.getPageHeight();
            const threshold = pageHeight * 0.16;
            const dy = this.dragOffsetY;
            if (dy < -threshold) this.navigateTo(this.currentVideoIndex + 1);
            else if (dy > threshold) this.navigateTo(this.currentVideoIndex - 1);
            else this.snapBack();
            this.suppressClickUntil = Date.now() + 220;
        }

        this.resetGestureState();
        mouseDown = false;
    });
};

VideoPlayer.prototype.resetGestureState = function() {
    this.isDragging = false;
    this.isLongPressing = false;
    this.gestureStartY = 0;
    this.gestureStartX = 0;
    this.velocityY = 0;
    if (this.dragRaf) {
        cancelAnimationFrame(this.dragRaf);
        this.dragRaf = 0;
    }
};

VideoPlayer.prototype.clampDragOffset = function(deltaY) {
    const pageHeight = this.getPageHeight();
    const limit = pageHeight * 1.05;
    let value = deltaY;
    if (value > limit) value = limit + (value - limit) * 0.15;
    if (value < -limit) value = -limit + (value + limit) * 0.15;

    // 首尾边界阻尼，避免拖出大片黑边
    if (value > 0 && this.currentVideoIndex === 0) value *= 0.28;
    if (value < 0 && this.currentVideoIndex === this.playbackOrder.length - 1) value *= 0.28;
    return value;
};

VideoPlayer.prototype.handleKeyboard = function(e) {
    const target = e.target;
    if (target && target.closest && target.closest('input, textarea, select, button, [role="button"], [contenteditable="true"]')) {
        if (e.key === 'Escape') this.exitFilter();
        return;
    }
    if (this.sidebar.classList.contains('show') && e.key !== 'Escape') return;

    switch (e.key) {
        case 'w': case 'W': case 'ArrowUp':
            e.preventDefault();
            if (!e.repeat) this.navigateUp();
            break;
        case 's': case 'S': case 'ArrowDown':
            e.preventDefault();
            if (!e.repeat) this.navigateDown();
            break;
        case 'a': case 'A': case 'ArrowLeft':
            e.preventDefault();
            if (!e.repeat) this.seekBy(-5);
            break;
        case 'd': case 'D': case 'ArrowRight':
            e.preventDefault();
            if (!e.repeat) this.seekBy(5);
            break;
        case ' ':
            e.preventDefault();
            if (e.repeat || this.spaceDownAt) break;
            this.spaceDownAt = Date.now();
            this.spaceLongPressTriggered = false;
            clearTimeout(this.spaceLongPressTimer);
            this.spaceLongPressTimer = setTimeout(() => {
                if (!this.spaceDownAt) return;
                this.spaceLongPressTriggered = true;
                this.startLongPress();
            }, 250);
            break;
        case 'Escape':
            this.exitFilter();
            break;
    }
};

VideoPlayer.prototype.handleKeyUp = function(e) {
    if (e.key !== ' ') return;
    if (!this.spaceDownAt) return;

    clearTimeout(this.spaceLongPressTimer);
    this.spaceLongPressTimer = null;
    const heldMs = Date.now() - this.spaceDownAt;
    this.spaceDownAt = 0;

    if (this.spaceLongPressTriggered) {
        this.spaceLongPressTriggered = false;
        this.endLongPress();
        return;
    }

    if (heldMs < 250) {
        const item = this.getActiveItem();
        const video = item ? item.querySelector('video') : null;
        const indicator = item ? item.querySelector('.play-indicator') : null;
        if (video) this.togglePlay(video, indicator);
    }
};

VideoPlayer.prototype.cancelSpaceLongPress = function() {
    if (!this.spaceDownAt) return;
    clearTimeout(this.spaceLongPressTimer);
    this.spaceLongPressTimer = null;
    const wasTriggered = this.spaceLongPressTriggered;
    this.spaceDownAt = 0;
    this.spaceLongPressTriggered = false;
    if (wasTriggered) this.endLongPress();
};

VideoPlayer.prototype.handleTouchStart = function(e) {
    if (this.sidebar.classList.contains('show')) return;
    if (e.touches.length > 1) return;
    const target = e.target;
    if (target && target.closest && target.closest('.bottom-controls, .right-actions, .speed-menu, .filter-bar, .top-bar, .hashtag, .author')) return;

    // 翻页动画中再次触摸：立即结束动画并接管，不“禁止”用户操作
    if (this.animating) this.finishNavigation();

    this.tryUnmute();

    const touch = e.touches[0];
    this.gestureStartY = touch.clientY;
    this.gestureStartX = touch.clientX;
    this.gestureStartTime = Date.now();
    this.lastTouchY = touch.clientY;
    this.lastTouchTime = Date.now();
    this.velocityY = 0;
    this.isDragging = false;
    this.dragOffsetY = 0;
    this.hasLongPressActionTriggered = false;
    this.isLongPressing = true;

    this.ensureMounted(this.currentVideoIndex - 1);
    this.ensureMounted(this.currentVideoIndex + 1);

    clearTimeout(this.longPressTimer);
    this.longPressTimer = setTimeout(() => {
        if (this.isLongPressing && !this.isDragging) this.startLongPress();
    }, 250);
};

VideoPlayer.prototype.handleTouchMove = function(e) {
    if (this.gestureStartY === 0) return;
    if (this.hasLongPressActionTriggered) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - this.gestureStartY;
    const deltaX = touch.clientX - this.gestureStartX;

    if (!this.isDragging && Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        this.isDragging = true;
        this.isLongPressing = false;
        clearTimeout(this.longPressTimer);
    }

    if (!this.isDragging) return;

    if (e.cancelable) e.preventDefault();

    this.dragOffsetY = this.clampDragOffset(deltaY);

    const now = Date.now();
    const dt = now - this.lastTouchTime;
    if (dt > 0) {
        const instantVelocity = (touch.clientY - this.lastTouchY) / dt;
        this.velocityY = this.velocityY * 0.4 + instantVelocity * 0.6;
    }
    this.lastTouchY = touch.clientY;
    this.lastTouchTime = now;

    this.scheduleDragPositions();
};

VideoPlayer.prototype.handleTouchEnd = function(e) {
    clearTimeout(this.longPressTimer);
    this.isLongPressing = false;

    if (this.hasLongPressActionTriggered) {
        if (e.cancelable) e.preventDefault();
        this.endLongPress();
        this.resetGestureState();
        return;
    }

    if (e.type === 'touchcancel') {
        if (this.isDragging) this.snapBack();
        this.resetGestureState();
        return;
    }

    if (this.isDragging) {
        if (this.dragRaf) {
            cancelAnimationFrame(this.dragRaf);
            this.dragRaf = 0;
        }
        this.applyDragPositions();

        const pageHeight = this.getPageHeight();
        const threshold = pageHeight * 0.16;
        const velocityThreshold = 0.35;
        const recent = Date.now() - this.lastTouchTime < 120 ? this.velocityY : 0;
        const dy = this.dragOffsetY;

        if (dy < -threshold || recent < -velocityThreshold) {
            this.navigateTo(this.currentVideoIndex + 1);
        } else if (dy > threshold || recent > velocityThreshold) {
            this.navigateTo(this.currentVideoIndex - 1);
        } else {
            this.snapBack();
        }
        this.suppressClickUntil = Date.now() + 220;
    }

    this.resetGestureState();
};

VideoPlayer.prototype.handleWheel = function(e) {
    if (this.sidebar.classList.contains('show')) return;
    if (this.animating) this.finishNavigation();
    e.preventDefault();

    clearTimeout(this._wheelTimer);
    this._wheelDelta = (this._wheelDelta || 0) + e.deltaY;

    const now = Date.now();
    if (Math.abs(this._wheelDelta) > 40 && now - (this._lastWheelNav || 0) > 200) {
        if (this._wheelDelta > 0) this.navigateDown();
        else this.navigateUp();
        this._lastWheelNav = now;
        this._wheelDelta = 0;
    }

    this._wheelTimer = setTimeout(() => { this._wheelDelta = 0; }, 160);
};
