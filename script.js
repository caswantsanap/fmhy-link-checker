document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const btnRefresh = document.getElementById('btn-refresh');
    const btnTheme = document.getElementById('btn-theme');
    const btnForceCheck = document.getElementById('btn-force-check');
    const liveCheckToggle = document.getElementById('live-check-toggle');
    const btnClear = document.getElementById('btn-clear');
    const btnCopy = document.getElementById('btn-copy');
    const inputTextarea = document.getElementById('input-textarea');
    const outputTextarea = document.getElementById('output-textarea');
    const highlightsBackdrop = document.getElementById('highlights-backdrop');

    // Status Bar & Problems Panel
    const statusErrorBtn = document.getElementById('status-error-btn');
    const errorCountSpan = document.getElementById('error-count');
    const warningCountSpan = document.getElementById('warning-count');
    const statusMessage = document.getElementById('status-message');

    let fmhyData = "";
    let isFetching = false;
    let warnings = 0;

    // --- Local Storage & Theme Init ---
    function updateThemeIcons(isLight) {
        const iconSun = document.getElementById('icon-sun');
        const iconMoon = document.getElementById('icon-moon');
        if (!iconSun || !iconMoon) return;
        if (isLight) {
            iconSun.style.display = 'none';
            iconMoon.style.display = 'block';
        } else {
            iconSun.style.display = 'block';
            iconMoon.style.display = 'none';
        }
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        updateThemeIcons(true);
    }

    const savedLiveCheck = localStorage.getItem('liveCheck');
    if (savedLiveCheck === 'false') {
        liveCheckToggle.checked = false;
        btnForceCheck.style.display = 'flex';
    }

    const savedInput = localStorage.getItem('linkCheckerInput');
    if (savedInput) {
        inputTextarea.value = savedInput;
        // Trigger initial check after fetch
        setTimeout(checkLinks, 100);
    }

    function flashButton(btnElement) {
        if (!btnElement) return;
        btnElement.classList.remove('active-flash');
        void btnElement.offsetWidth; // trigger reflow to restart animation
        btnElement.classList.add('active-flash');
    }

    btnTheme.addEventListener('click', () => {
        flashButton(btnTheme);
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        updateThemeIcons(isLight);
    });

    liveCheckToggle.addEventListener('change', () => {
        localStorage.setItem('liveCheck', liveCheckToggle.checked);
        if (liveCheckToggle.checked) {
            btnForceCheck.style.display = 'none';
            checkLinks(); // trigger immediately when turned back on
        } else {
            btnForceCheck.style.display = 'flex';
        }
    });

    btnForceCheck.addEventListener('click', () => {
        flashButton(btnForceCheck);
        checkLinks();
    });

    // --- Action Buttons ---
    btnClear.addEventListener('click', () => {
        flashButton(btnClear);
        inputTextarea.value = '';
        localStorage.removeItem('linkCheckerInput');
        checkLinks();
    });

    btnCopy.addEventListener('click', async () => {
        flashButton(btnCopy);
        if (!outputTextarea.value) return;
        try {
            await navigator.clipboard.writeText(outputTextarea.value);
            const textSpan = btnCopy.querySelector('.btn-text');
            if (textSpan) {
                const originalText = textSpan.textContent;
                textSpan.textContent = 'Copied!';
                setTimeout(() => textSpan.textContent = originalText, 2000);
            }
        } catch (err) {
            console.error('Failed to copy', err);
        }
    });

    // --- Editor Backdrop Syncing ---
    // Make sure trailing newlines scroll properly padding is exact
    // Handle scrolling
    inputTextarea.addEventListener('scroll', () => {
        highlightsBackdrop.scrollTop = inputTextarea.scrollTop;
        highlightsBackdrop.scrollLeft = inputTextarea.scrollLeft;
    });

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Split pane handle logic
    const divider = document.querySelector('.pane-divider');
    let isDragging = false;

    divider.addEventListener('mousedown', (e) => {
        isDragging = true;
        const isColumn = window.innerWidth <= 768;
        document.body.style.cursor = isColumn ? 'row-resize' : 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const container = document.querySelector('.editor-container');
        const containerRect = container.getBoundingClientRect();
        const isColumn = window.innerWidth <= 768;

        if (isColumn) {
            const newTopHeight = e.clientY - containerRect.top;
            if (newTopHeight > 80 && newTopHeight < containerRect.height - 80) {
                document.querySelector('.left-pane').style.flex = `0 0 ${newTopHeight}px`;
            }
        } else {
            const newLeftWidth = e.clientX - containerRect.left;
            if (newLeftWidth > 150 && newLeftWidth < containerRect.width - 150) {
                document.querySelector('.left-pane').style.flex = `0 0 ${newLeftWidth}px`;
            }
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = 'default';
    });

    let wasColumn = window.innerWidth <= 768;
    window.addEventListener('resize', () => {
        const isColumn = window.innerWidth <= 768;
        if (isColumn !== wasColumn) {
            document.querySelector('.left-pane').style.flex = '';
            wasColumn = isColumn;
        }
    });

    // Fetch FMHY data
    async function fetchFMHYData() {
        if (fmhyData) return fmhyData; // Return memory cached

        try {
            isFetching = true;
            updateStatus('Fetching 1.8MB Database...', true);
            const response = await fetch('https://api.fmhy.net/single-page');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            fmhyData = await response.text();

            // Save to local storage for offline use
            try {
                localStorage.setItem('fmhyOfflineCache', fmhyData);
            } catch (e) {
                console.warn("Could not save to localStorage (might be full)", e);
            }

            updateStatus('Ready');
            return fmhyData;
        } catch (error) {
            // If the network request fails, try to load from the offline cache
            const offlineCache = localStorage.getItem('fmhyOfflineCache');
            if (offlineCache) {
                fmhyData = offlineCache;
                updateStatus('Offline Mode (Using cached database)', false);
                return fmhyData;
            }

            updateStatus('Error: No internet & no offline cache found');
            console.error('Failed to fetch:', error);
            return null;
        } finally {
            isFetching = false;
        }
    }

    function updateStatus(message, loading = false) {
        if (loading) {
            statusMessage.innerHTML = `<svg class="loading-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>` + message;
        } else {
            statusMessage.textContent = message;
        }
    }

    // Main Validation Logic
    async function checkLinks() {
        const text = inputTextarea.value;
        localStorage.setItem('linkCheckerInput', text);

        if (!text.trim()) {
            updateStatus('Ready');
            outputTextarea.value = '';
            highlightsBackdrop.innerHTML = '';
            errorCountSpan.textContent = 0;
            warningCountSpan.textContent = 0;
            statusErrorBtn.classList.remove('has-errors');
            return;
        }

        updateStatus('Checking Links...', true);
        // Force the browser to render the status update before blocking the main thread
        await new Promise(resolve => setTimeout(resolve, 10));

        const data = await fetchFMHYData();

        if (!data) {
            return;
        }

        let conflictingUrls = new Set();
        let validUrls = new Set();
        warnings = 0;

        // Find all URLs using Regex (Markdown/HTML extraction)
        // Allows robust extraction even if pasted as random text
        const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
        const matches = text.match(urlRegex) || [];

        matches.forEach(url => {
            // Check if URL exists in FMHY
            if (data.includes(url)) {
                conflictingUrls.add(url);
            } else {
                validUrls.add(url);
            }
        });

        // Update output pane
        outputTextarea.value = Array.from(validUrls).join('\n');

        // Update Syntax Highlighting Backdrop
        // Important: escape HTML to avoid executing pasted tags
        let highlightedHtml = escapeHtml(text);

        // Sort descending by length so substrings aren't wrongly replaced first
        const sortedConflicts = Array.from(conflictingUrls).sort((a, b) => b.length - a.length);

        sortedConflicts.forEach(url => {
            const escapedUrl = escapeHtml(url);
            // Quick global replace
            highlightedHtml = highlightedHtml.split(escapedUrl).join(`<mark class="conflict-error">${escapedUrl}</mark>`);
        });

        // Safari/some browsers need a trailing space to render the last newline height properly
        highlightsBackdrop.innerHTML = highlightedHtml + ' ';

        // Update UI
        const errorCount = conflictingUrls.size;
        errorCountSpan.textContent = errorCount;
        warningCountSpan.textContent = warnings;

        if (errorCount > 0) {
            statusErrorBtn.classList.add('has-errors');
            updateStatus(`Found ${errorCount} conflicting links in your input`);
        } else {
            statusErrorBtn.classList.remove('has-errors');
            updateStatus(`Success: All parsed links are clean`);
        }
    }

    // Auto-check on input (debounced slightly to avoid freezing on massive pastes)
    let debounceTimer;
    inputTextarea.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        if (liveCheckToggle.checked) {
            debounceTimer = setTimeout(checkLinks, 300);
        }

        // Keep scrolling perfectly synced as typing makes text wrap
        highlightsBackdrop.scrollTop = inputTextarea.scrollTop;
    });

    btnRefresh.addEventListener('click', async () => {
        flashButton(btnRefresh);
        fmhyData = ""; // clear cache to force refresh
        await fetchFMHYData(); // explicitly fetch the fresh data
        await checkLinks(); // will recheck the input if there is any
    });

    // --- Picture-in-Picture Popout ---
    const btnPopout = document.getElementById('btn-popout');
    let pipWindow = null;

    if (btnPopout) {
        btnPopout.addEventListener('click', async () => {
            flashButton(btnPopout);

            if (!('documentPictureInPicture' in window)) {
                alert('Always-on-Top windows require the Document Picture-in-Picture API. Please try using a recent version of Chrome, Edge, or Brave (v116+).');
                return;
            }

            if (pipWindow) {
                pipWindow.close();
                return;
            }

            try {
                pipWindow = await window.documentPictureInPicture.requestWindow({
                    width: Math.max(800, window.innerWidth * 0.8),
                    height: Math.max(600, window.innerHeight * 0.8)
                });

                // Copy all stylesheet links and inline styles to the floating window
                document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => {
                    pipWindow.document.head.appendChild(el.cloneNode(true));
                });

                // Copy current theme class state
                pipWindow.document.body.className = document.body.className;

                // Create visual placeholder in the original browser tab
                const placeholder = document.createElement('div');
                placeholder.id = "pip-placeholder";
                placeholder.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; color:var(--text-muted); font-family:var(--font-ui);">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.5;">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        <h2 style="font-weight: 500;">Link Checker is running in a floating window</h2>
                        <p style="margin-top: 8px; font-size: 14px;">Press 'Back to tab' to return the window.</p>
                    </div>`;

                const container = document.querySelector('.editor-container');
                const statusBar = document.querySelector('.status-bar');

                document.body.appendChild(placeholder);

                // Teleport the actual interactive DOM elements to the floating window
                pipWindow.document.body.appendChild(container);
                pipWindow.document.body.appendChild(statusBar);

                // Hide the popout button in the popup itself
                btnPopout.style.display = 'none';

                // Automatically vacuum elements back to main window if floating window closes
                pipWindow.addEventListener("pagehide", () => {
                    const p = document.getElementById("pip-placeholder");
                    if (p) p.remove();

                    document.body.appendChild(container);
                    document.body.appendChild(statusBar);
                    btnPopout.style.display = 'flex';

                    pipWindow = null;
                });
            } catch (error) {
                console.error("Failed to open floating window:", error);
            }
        });
    }

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter to Check Now
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            btnForceCheck.click();
        }

        // Ctrl/Cmd + Shift + C to Copy
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            btnCopy.click();
        }

        // Alt + C to Clear All
        if (e.altKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            btnClear.click();
        }

        // Ctrl/Cmd + Shift + R to Refresh Data
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
            e.preventDefault();
            btnRefresh.click();
        }
    });
});
