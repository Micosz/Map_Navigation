// =====================================================
// A* PRIORITY QUEUE
// =====================================================
class PriorityQueue {
    constructor() { this.items = []; }
    enqueue(element, priority) {
        let contain = false;
        let qElement = { element, priority };
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].priority > qElement.priority) {
                this.items.splice(i, 0, qElement);
                contain = true;
                break;
            }
        }
        if (!contain) this.items.push(qElement);
    }
    dequeue() { return this.isEmpty() ? null : this.items.shift().element; }
    isEmpty() { return this.items.length === 0; }
}

// =====================================================
// MULTI-LANGUAGE SYSTEM (TH / EN)
// =====================================================
let currentLang = 'en';

const translations = {
    en: {
        title: 'Indoor Wayfinder',
        from: 'FROM:',
        to: 'TO:',
        navigate: 'Navigate',
        share: 'Share',
        reset: 'Reset',
        dark: 'Dark',
        light: 'Light',
        floor1: 'Floor 1',
        floor2: 'Floor 2',
        directions: '📋 Directions',
        // Direction instructions
        startAt: 'Start at',
        room: 'Room',
        walkHallway: 'Walk along the hallway on',
        floor: 'Floor',
        takeStairs: 'Take',
        toFloor: 'to',
        arriveAt: 'Arrive at',
        passBy: 'Pass by',
        // Toasts
        calcPoints: 'Calculating points...',
        enterBoth: 'Please enter BOTH a Start and Goal...',
        noRoute: 'No valid route could be constructed.',
        routeLabel: 'Route',
        startDetected: 'Start location auto-detected',
        sharedRoute: 'Shared route detected — navigating...',
        linkCopied: '🔗 Route link copied to clipboard!',
        enterBothShare: 'Enter both Start and Goal to share a route.',
        resetDone: '↺ Navigation reset.',
    },
    th: {
        title: 'ระบบนำทางภายใน',
        from: 'จาก:',
        to: 'ถึง:',
        navigate: 'นำทาง',
        share: 'แชร์',
        reset: 'รีเซ็ต',
        dark: 'มืด',
        light: 'สว่าง',
        floor1: 'ชั้น 1',
        floor2: 'ชั้น 2',
        directions: '📋 เส้นทาง',
        startAt: 'เริ่มที่',
        room: 'ห้อง',
        walkHallway: 'เดินไปตามทางเดินบน',
        floor: 'ชั้น',
        takeStairs: 'ใช้',
        toFloor: 'ไป',
        arriveAt: 'ถึง',
        passBy: 'ผ่าน',
        calcPoints: 'กำลังคำนวณ...',
        enterBoth: 'กรุณากรอกทั้งจุดเริ่มต้นและปลายทาง...',
        noRoute: 'ไม่สามารถสร้างเส้นทางได้',
        routeLabel: 'เส้นทาง',
        startDetected: 'ตรวจพบจุดเริ่มต้นอัตโนมัติ',
        sharedRoute: 'ตรวจพบเส้นทางที่แชร์ — กำลังนำทาง...',
        linkCopied: '🔗 คัดลอกลิงก์เส้นทางแล้ว!',
        enterBothShare: 'กรอกจุดเริ่มต้นและปลายทางก่อนแชร์',
        resetDone: '↺ รีเซ็ตการนำทางแล้ว',
    }
};

/** Get translated string */
function t(key) {
    return (translations[currentLang] && translations[currentLang][key]) || translations.en[key] || key;
}

/** Apply translations to all data-i18n elements */
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (text) el.textContent = text;
    });
    // Update language label
    const langLabel = document.getElementById('lang-label');
    if (langLabel) langLabel.textContent = currentLang.toUpperCase();
}

/** Toggle between EN and TH */
function toggleLanguage() {
    const btn = document.getElementById('btn-lang');
    if (btn) {
        btn.classList.add('btn-active');
        setTimeout(() => btn.classList.remove('btn-active'), 200);
    }
    currentLang = currentLang === 'en' ? 'th' : 'en';
    applyTranslations();

    // Re-render directions if visible
    if (lastRenderedPath) {
        const steps = generateInstructions(lastRenderedPath);
        renderDirections(steps);
    }
}

// =====================================================
// THEME SYSTEM (Dark / Light)
// =====================================================
let currentTheme = 'dark';

function toggleTheme() {
    const btn = document.getElementById('btn-theme');
    if (btn) {
        btn.classList.add('btn-active');
        setTimeout(() => btn.classList.remove('btn-active'), 200);
    }
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('light-theme', currentTheme === 'light');

    // Update HUD icon/label
    const themeIcon = document.getElementById('theme-icon');
    const themeLabel = document.getElementById('theme-label');
    if (currentTheme === 'light') {
        if (themeIcon) themeIcon.textContent = '☀️';
        if (themeLabel) themeLabel.setAttribute('data-i18n', 'light');
        if (themeLabel) themeLabel.textContent = t('light');
    } else {
        if (themeIcon) themeIcon.textContent = '🌙';
        if (themeLabel) themeLabel.setAttribute('data-i18n', 'dark');
        if (themeLabel) themeLabel.textContent = t('dark');
    }
}

// =====================================================
// SEARCH SUGGESTION SYSTEM
// =====================================================

const SEARCHABLE_TYPES = ['room', 'stairs', 'toilet', 'elevator', 'cafe', 'lab', 'office'];

const TYPE_ICONS = {
    room: '🚪', stairs: '🪜', toilet: '🚻', elevator: '🛗',
    cafe: '☕', lab: '🔬', office: '💼',
    event: '📅', course: '📚'
};

let cachedSearchTerms = null;

function extractSearchTerms(graphData) {
    if (!graphData || !graphData.nodes) return [];
    return graphData.nodes
        .filter(n => SEARCHABLE_TYPES.includes(n.type))
        .map(n => ({ name: n.name, label: n.label || '', type: n.type, floor: n.floor, id: n.id, category: 'room' }))
        .sort((a, b) => {
            const numA = parseFloat(a.name);
            const numB = parseFloat(b.name);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.name.localeCompare(b.name);
        });
}

async function ensureGraphLoaded() {
    if (globalGraphState) return globalGraphState;
    try {
        const baseUrl = window.API_SEARCH_ENDPOINT || 'http://localhost/search';
        const res = await fetch(`${baseUrl}?search=101`, {
            method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.graph && data.graph.nodes) {
                globalGraphState = data.graph;
                cachedSearchTerms = extractSearchTerms(globalGraphState);
            }
        }
    } catch (e) {
        console.warn('Graph pre-fetch failed:', e.message);
    }
    return globalGraphState;
}

function setupAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    let activeIndex = -1;

    if (input.readOnly) return;

    input.addEventListener('focus', async () => {
        await ensureGraphLoaded();
        if (input.value.trim()) renderSuggestions(input, list);
    });

    input.addEventListener('input', () => {
        activeIndex = -1;
        renderSuggestions(input, list);
    });

    input.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.suggestion-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            updateActiveItem(items, activeIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActiveItem(items, activeIndex);
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            items[activeIndex].click();
        } else if (e.key === 'Escape') {
            closeSuggestions(list);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => closeSuggestions(list), 200);
    });
}

let searchDebounceTimer = null;

function renderSuggestions(input, list) {
    const query = input.value.trim().toLowerCase();
    
    if (!query) { 
        closeSuggestions(list); 
        return; 
    }

    // Debounced API search for ALL categories
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
        try {
            const apiMatches = await searchEventsFromAPI(query);
            if (input.value.trim().toLowerCase() === query) {
                renderMatchItems(apiMatches, input, list, []);
            }
        } catch (e) {
            // Silently fail
        }
    }, 250);
}

/**
 * Search the API for events/courses matching the query.
 * Returns an array of suggestion-compatible objects.
 */
async function searchEventsFromAPI(query) {
    try {
        const baseUrl = window.API_SEARCH_ENDPOINT || 'http://localhost/search';
        const res = await fetch(`${baseUrl}?search=${encodeURIComponent(query)}`, {
            method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) return [];

        const data = await res.json();
        if (!data.locations) return [];

        return data.locations
            .map(loc => ({
                name: loc.SearchTerm,
                label: loc.RoomName || '',
                type: loc.category,
                category: loc.category,
                floor: parseInt(loc.Floor) || 1,
                id: loc.NodeID,
                nodeEntry: loc.NodeEntry,
                roomNumber: loc.RoomNumber
            }));
    } catch (e) {
        return [];
    }
}

/**
 * Render suggestion items into the list.
 * If apiMatches are provided, they are appended after local matches.
 */
function renderMatchItems(localMatches, input, list, apiMatches = []) {
    list.innerHTML = '';

    const allMatches = [...localMatches, ...apiMatches].slice(0, 8);

    if (allMatches.length === 0) { closeSuggestions(list); return; }

    allMatches.forEach(term => {
        const item = document.createElement('div');
        const cat = term.category || 'room';
        item.className = `suggestion-item suggestion-type-${cat}`;
        const icon = TYPE_ICONS[cat] || TYPE_ICONS[term.type] || '📍';
        const floorLabel = currentLang === 'th' ? `ชั้น${term.floor}` : `F${term.floor}`;

        // Build category badge for events/courses
        let catBadge = '';
        if (cat === 'event') {
            catBadge = `<span class="search-type-badge badge-event">${currentLang === 'th' ? 'กิจกรรม' : 'Event'}</span>`;
        } else if (cat === 'course') {
            catBadge = `<span class="search-type-badge badge-course">${currentLang === 'th' ? 'วิชา' : 'Course'}</span>`;
        }

        item.innerHTML = `
            <div class="room-name">
                <span class="type-icon">${icon}</span>
                ${term.name}
                <span class="floor-tag">${floorLabel}</span>
                ${catBadge}
            </div>
            ${term.label ? `<div class="room-label">${term.label}</div>` : ''}
        `;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            // For events/courses, put the SearchTerm in the input
            // so the API can resolve it to the correct node
            input.value = term.name;
            closeSuggestions(list);
            input.focus();
        });
        list.appendChild(item);
    });
    list.classList.add('active');
}

function closeSuggestions(list) {
    list.classList.remove('active');
    list.innerHTML = '';
}

function updateActiveItem(items, index) {
    items.forEach((item, i) => item.classList.toggle('active', i === index));
    if (items[index]) items[index].scrollIntoView({ block: 'nearest' });
}

// =====================================================
// STEP-BY-STEP DIRECTION GENERATOR (i18n)
// =====================================================
let lastRenderedPath = null;

function generateInstructions(path) {
    if (!path || path.length < 2) return [];

    const steps = [];
    const startNode = path[0];
    const endNode = path[path.length - 1];

    // Start
    const startRoomLabel = startNode.type === 'room'
        ? `${t('room')} <span class="step-highlight">${startNode.name}</span>`
        : `<span class="step-highlight">${startNode.name}</span>`;
    const startMeta = startNode.label ? ` — ${startNode.label}` : '';
    steps.push({ icon: '📍', text: `${t('startAt')} ${startRoomLabel}${startMeta}`, type: 'start' });

    // Mid path
    let i = 1;
    while (i < path.length - 1) {
        const node = path[i];
        const prevNode = path[i - 1];

        if (node.floor !== prevNode.floor) {
            const stairName = prevNode.type === 'stairs' ? prevNode.name :
                              node.type === 'stairs' ? node.name : 'stairs';
            steps.push({
                icon: '🪜',
                text: `${t('takeStairs')} <span class="step-highlight">${stairName}</span> ${t('toFloor')} <span class="step-highlight">${t('floor')} ${node.floor}</span>`,
                type: 'stairs'
            });
            i++;
            continue;
        }

        if (node.type === 'junction' || node.type === 'entrance' || node.type === 'walk') {
            let walkEnd = i;
            while (walkEnd < path.length - 1) {
                const nextNode = path[walkEnd + 1];
                if (nextNode.floor !== node.floor) break;
                if (nextNode.type === 'room' || (SEARCHABLE_TYPES.includes(nextNode.type) && nextNode.type !== 'stairs')) break;
                if (nextNode.type === 'stairs') break;
                walkEnd++;
            }
            steps.push({
                icon: '🚶',
                text: `${t('walkHallway')} <span class="step-highlight">${t('floor')} ${node.floor}</span>`,
                type: 'walk'
            });
            i = walkEnd + 1;
            continue;
        }

        if (SEARCHABLE_TYPES.includes(node.type) && node.type !== 'stairs') {
            steps.push({
                icon: TYPE_ICONS[node.type] || '📍',
                text: `${t('passBy')} <span class="step-highlight">${node.name}</span>`,
                type: 'walk'
            });
        }
        i++;
    }

    // Destination
    const endRoomLabel = endNode.type === 'room'
        ? `${t('room')} <span class="step-highlight">${endNode.name}</span>`
        : `<span class="step-highlight">${endNode.name}</span>`;
    const endMeta = endNode.label ? ` — ${endNode.label}` : '';
    steps.push({ icon: '🏁', text: `${t('arriveAt')} ${endRoomLabel}${endMeta}`, type: 'end' });

    return steps;
}

function renderDirections(steps) {
    const container = document.getElementById('directions-container');
    if (!steps || steps.length === 0) {
        container.classList.remove('active');
        return;
    }

    let html = `
        <div class="directions-header">
            <h3>${t('directions')}</h3>
            <button class="directions-close" onclick="closeDirections()">✕</button>
        </div>
        <ol class="directions-list">
    `;
    steps.forEach((step, idx) => {
        html += `
            <li class="direction-step step-${step.type}">
                <span class="step-number">${idx + 1}</span>
                <span class="step-icon">${step.icon}</span>
                <span class="step-text">${step.text}</span>
            </li>`;
    });
    html += '</ol>';
    container.innerHTML = html;
    container.classList.add('active');
}

function closeDirections() {
    document.getElementById('directions-container').classList.remove('active');
}

// =====================================================
// RESET NAVIGATION
// =====================================================
function resetNavigation() {
    const btn = document.getElementById('btn-reset');
    if (btn) {
        btn.classList.add('btn-active');
        setTimeout(() => btn.classList.remove('btn-active'), 200);
    }
    // Cancel any running route animation
    if (routeAnimationFrameId) {
        cancelAnimationFrame(routeAnimationFrameId);
        routeAnimationFrameId = null;
    }

    // Clear inputs
    const startInput = document.getElementById('start-query');
    const goalInput = document.getElementById('goal-query');
    startInput.value = '';
    startInput.readOnly = false;
    goalInput.value = '';

    // Clear canvas routes
    const c1 = document.getElementById('canvas-floor-1');
    const c2 = document.getElementById('canvas-floor-2');
    c1.getContext('2d').clearRect(0, 0, c1.width, c1.height);
    c2.getContext('2d').clearRect(0, 0, c2.width, c2.height);

    // Hide directions
    closeDirections();
    lastRenderedPath = null;

    // Reset map zoom/pan
    resetMapTransform();

    // Reset floor to 1
    switchFloor(1);

    // Clean URL params
    if (window.history.replaceState) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    showToast(t('resetDone'));
    startInput.focus();
}

// =====================================================
// ROUTE SHARING
// =====================================================
function shareRoute() {
    const btn = document.getElementById('btn-share');
    btn.classList.add('btn-active');
    setTimeout(() => btn.classList.remove('btn-active'), 200);

    const startVal = document.getElementById('start-query').value.trim();
    const goalVal = document.getElementById('goal-query').value.trim();

    if (!startVal || !goalVal) {
        showToast(t('enterBothShare'), 'error');
        return;
    }

    const url = new URL(window.location.href.split('?')[0]);
    url.searchParams.set('start', startVal);
    url.searchParams.set('goal', goalVal);

    navigator.clipboard.writeText(url.toString()).then(() => {
        showToast(t('linkCopied'));
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = url.toString();
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(t('linkCopied'));
    });
}

// =====================================================
// PINCH-TO-ZOOM & DRAG-TO-PAN
// =====================================================
let mapScale = 1;
let mapPanX = 0;
let mapPanY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let lastPanX = 0;
let lastPanY = 0;
let initialPinchDist = 0;
let initialPinchScale = 1;

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

function getViewport() {
    return document.getElementById('map-viewport');
}

function applyMapTransform() {
    const vp = getViewport();
    if (vp) {
        vp.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapScale})`;
    }
}

function resetMapTransform() {
    mapScale = 1;
    mapPanX = 0;
    mapPanY = 0;
    applyMapTransform();
}

function getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function setupMapGestures() {
    const arena = document.getElementById('map-arena');
    if (!arena) return;

    // --- Touch Events ---
    arena.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch start
            e.preventDefault();
            initialPinchDist = getPinchDistance(e.touches);
            initialPinchScale = mapScale;
        } else if (e.touches.length === 1) {
            // Pan start
            isPanning = true;
            startPanX = e.touches[0].clientX - mapPanX;
            startPanY = e.touches[0].clientY - mapPanY;
        }
    }, { passive: false });

    arena.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom
            e.preventDefault();
            const dist = getPinchDistance(e.touches);
            const scale = initialPinchScale * (dist / initialPinchDist);
            mapScale = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
            applyMapTransform();
        } else if (e.touches.length === 1 && isPanning) {
            // Pan
            e.preventDefault();
            mapPanX = e.touches[0].clientX - startPanX;
            mapPanY = e.touches[0].clientY - startPanY;
            applyMapTransform();
        }
    }, { passive: false });

    arena.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialPinchDist = 0;
        }
        if (e.touches.length === 0) {
            isPanning = false;
        }
    });

    // --- Mouse Events (Desktop drag-to-pan) ---
    arena.addEventListener('mousedown', (e) => {
        isPanning = true;
        startPanX = e.clientX - mapPanX;
        startPanY = e.clientY - mapPanY;
        arena.style.cursor = 'grabbing';
    });

    arena.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        mapPanX = e.clientX - startPanX;
        mapPanY = e.clientY - startPanY;
        applyMapTransform();
    });

    arena.addEventListener('mouseup', () => {
        isPanning = false;
        arena.style.cursor = 'grab';
    });

    arena.addEventListener('mouseleave', () => {
        isPanning = false;
        arena.style.cursor = 'grab';
    });

    // --- Scroll Wheel Zoom (Desktop) ---
    arena.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(mapScale * delta, MIN_SCALE), MAX_SCALE);

        // Zoom toward cursor position
        const rect = arena.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const scaleChange = newScale / mapScale;
        mapPanX = mx - scaleChange * (mx - mapPanX);
        mapPanY = my - scaleChange * (my - mapPanY);
        mapScale = newScale;

        applyMapTransform();
    }, { passive: false });

    arena.style.cursor = 'grab';
}

// =====================================================
// DOM SETUP
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    // Floor badge hooks
    document.getElementById('badge-floor-1').addEventListener('click', () => switchFloor(1));
    document.getElementById('badge-floor-2').addEventListener('click', () => switchFloor(2));

    // Enter key support
    document.getElementById('goal-query').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); navigateUser(); }
    });
    document.getElementById('start-query').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); navigateUser(); }
    });

    // URL Parameter Detection (QR Code + Route Sharing)
    const urlParams = new URLSearchParams(window.location.search);
    const qrStart = urlParams.get('start');
    const qrGoal = urlParams.get('goal');

    if (qrStart) {
        const startInput = document.getElementById('start-query');
        startInput.value = qrStart;
        startInput.readOnly = true;
        showToast(`📍 ${t('startDetected')}: ${qrStart}`);
    }
    if (qrGoal) {
        document.getElementById('goal-query').value = qrGoal;
    }

    // Setup autocomplete
    setupAutocomplete('start-query', 'start-suggestions');
    setupAutocomplete('goal-query', 'goal-suggestions');

    // Auto-navigate if both params
    if (qrStart && qrGoal) {
        showToast(`🧭 ${t('sharedRoute')}`);
        setTimeout(() => navigateUser(), 500);
    } else if (qrStart) {
        document.getElementById('goal-query').focus();
    }

    // Apply initial translations
    applyTranslations();

    // Init map
    initMap();

    // Setup pinch-to-zoom / drag-to-pan gestures
    setupMapGestures();
});

// =====================================================
// MAP INITIALIZATION
// =====================================================
function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches;
}

function initMap() {
    if (isTouchDevice()) {
        setupMobileMap();
    } else {
        resizeMap();
        window.addEventListener('resize', resizeMap);
    }
}

function resizeMap() {
    document.querySelectorAll('.map-layer').forEach(layer => {
        const canvas = layer.querySelector('canvas');
        if (!canvas) return;
        const scaleX = window.innerWidth / (canvas.width + 40);
        const scaleY = (window.innerHeight - 180) / canvas.height;
        const scale = Math.min(scaleX, scaleY, 1.2);
        layer.style.transform = `translate(-50%, -45%) scale(${scale})`;
    });
}

function setupMobileMap() {
    const arena = document.getElementById('map-arena');
    arena.style.display = 'flex';
    arena.style.position = 'relative';

    document.querySelectorAll('.map-layer').forEach(layer => {
        layer.style.position = 'relative';
        layer.style.top = 'unset';
        layer.style.left = 'unset';
        layer.style.transform = 'none';
        layer.style.display = 'none';
    });

    const activeLayer = document.querySelector('.map-layer.active');
    if (activeLayer) activeLayer.style.display = 'block';

    window._mobileFloorSwitch = true;
}

// =====================================================
// GLOBAL STATE
// =====================================================
let currentFloor = 1;
var globalGraphState = null;
let routeAnimationFrameId = null;

// =====================================================
// CORE NAVIGATION LOGIC
// =====================================================
async function navigateUser(event) {
    if (event) event.preventDefault();

    const btn = document.getElementById('btn-navigate');
    if (btn) {
        btn.classList.add('btn-active');
        setTimeout(() => btn.classList.remove('btn-active'), 200);
    }

    const goalTerm = document.getElementById('goal-query').value.trim();
    const startTerm = document.getElementById('start-query').value.trim();

    if (!goalTerm || !startTerm) {
        showToast(t('enterBoth'), 'error');
        return;
    }

    try {
        showToast(t('calcPoints'));

        const baseUrl = window.API_SEARCH_ENDPOINT || 'http://localhost/search';
        const startUrl = `${baseUrl}?search=${encodeURIComponent(startTerm)}`;
        const goalUrl = `${baseUrl}?search=${encodeURIComponent(goalTerm)}`;

        const [resStart, resGoal] = await Promise.all([
            fetch(startUrl, { method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' } }),
            fetch(goalUrl, { method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' } })
        ]);

        if (!resStart.ok) throw new Error(resStart.status === 404 ? `Start Location '${startTerm}' not found.` : "API Connection error.");
        if (!resGoal.ok) throw new Error(resGoal.status === 404 ? `Destination '${goalTerm}' not found.` : "API Connection error.");

        const startData = await resStart.json();
        const goalData = await resGoal.json();

        if (!startData.graph || !startData.graph.nodes) {
            throw new Error("AWS System Error: Map data could not be retrieved from S3.");
        }

        globalGraphState = startData.graph;
        cachedSearchTerms = extractSearchTerms(globalGraphState);

        const startNodeId = startData.locations[0].NodeID;
        const targetNodeId = goalData.locations[0].NodeID;

        const path = aStar(startNodeId, targetNodeId, globalGraphState);

        if (!path) {
            showToast(t('noRoute'), 'error');
            return;
        }

        // Cancel any running route animation before starting a new one
        if (routeAnimationFrameId) {
            cancelAnimationFrame(routeAnimationFrameId);
            routeAnimationFrameId = null;
        }

        // Render route on map (animated)
        drawRoute(path);

        // Save path for language re-render
        lastRenderedPath = path;

        // Generate & render directions
        const steps = generateInstructions(path);
        renderDirections(steps);

        const resNameStart = startData.locations[0].RoomName || startTerm;
        const resNameGoal = goalData.locations[0].RoomName || goalTerm;
        showToast(`${t('routeLabel')}: ${resNameStart} ➔ ${resNameGoal}`);

    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// =====================================================
// PATHFINDING ENGINE
// =====================================================
const STAIRS_WEIGHT = 200;

function aStar(startId, goalId, graphData) {
    const nodes = {};
    graphData.nodes.forEach(n => nodes[n.id] = n);
    if (!nodes[startId] || !nodes[goalId]) return null;

    const pq = new PriorityQueue();
    pq.enqueue(startId, 0);
    const cameFrom = {};
    const costSoFar = { [startId]: 0 };

    while (!pq.isEmpty()) {
        const currentId = pq.dequeue();
        if (currentId === goalId) return reconstructPath(cameFrom, currentId, nodes);

        const currentEdges = graphData.edges.filter(e => e.from === currentId || e.to === currentId);
        for (const edge of currentEdges) {
            const nextId = edge.from === currentId ? edge.to : edge.from;
            let edgeWeight = edge.weight || calculateDistance(nodes[currentId], nodes[nextId]);
            if (nodes[currentId].floor !== nodes[nextId].floor) edgeWeight += STAIRS_WEIGHT;

            const newCost = costSoFar[currentId] + edgeWeight;
            if (!(nextId in costSoFar) || newCost < costSoFar[nextId]) {
                costSoFar[nextId] = newCost;
                const priority = newCost + calculateDistance(nodes[nextId], nodes[goalId]);
                pq.enqueue(nextId, priority);
                cameFrom[nextId] = currentId;
            }
        }
    }
    return null;
}

function calculateDistance(n1, n2) {
    return Math.sqrt(Math.pow(n1.x - n2.x, 2) + Math.pow(n1.y - n2.y, 2));
}

function reconstructPath(cameFrom, currentId, nodes) {
    const path = [nodes[currentId]];
    while (currentId in cameFrom) {
        currentId = cameFrom[currentId];
        path.unshift(nodes[currentId]);
    }
    return path;
}

// =====================================================
// RENDERING ENGINE
// =====================================================

// Animation speed: pixels drawn per frame (~60fps).
// Higher = faster line drawing. Tweak to taste.
const ROUTE_ANIMATION_SPEED = 8;

function switchFloor(floorNum) {
    currentFloor = floorNum;
    document.getElementById('badge-floor-1').classList.toggle('active', floorNum === 1);
    document.getElementById('badge-floor-2').classList.toggle('active', floorNum === 2);

    if (window._mobileFloorSwitch) {
        document.getElementById('layer-floor-1').style.display = floorNum === 1 ? 'block' : 'none';
        document.getElementById('layer-floor-2').style.display = floorNum === 2 ? 'block' : 'none';
    } else {
        document.getElementById('layer-floor-1').classList.toggle('active', floorNum === 1);
        document.getElementById('layer-floor-2').classList.toggle('active', floorNum === 2);
    }
}

/**
 * Draw a partial line segment between two nodes.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}} n1  Start node
 * @param {{x:number,y:number}} n2  End node
 * @param {number} ratio  0..1 how much of the segment to draw
 */
function drawSegment(ctx, n1, n2, ratio) {
    const endX = n1.x + (n2.x - n1.x) * ratio;
    const endY = n1.y + (n2.y - n1.y) * ratio;

    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    ctx.shadowBlur = 10;
    ctx.moveTo(n1.x, n1.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

/**
 * Animated route drawer.
 * Traces each segment sequentially using requestAnimationFrame.
 */
function drawRoute(path) {
    const c1 = document.getElementById('canvas-floor-1');
    const c2 = document.getElementById('canvas-floor-2');
    const ctx1 = c1.getContext('2d');
    const ctx2 = c2.getContext('2d');

    // Clear both canvases
    ctx1.clearRect(0, 0, c1.width, c1.height);
    ctx2.clearRect(0, 0, c2.width, c2.height);

    if (!path || path.length === 0) return;

    // ---- Pre-compute segment list with metadata ----
    const segments = [];
    for (let i = 0; i < path.length - 1; i++) {
        const n1 = path[i];
        const n2 = path[i + 1];
        const isFloorChange = n1.floor !== n2.floor;
        const length = isFloorChange
            ? 0
            : Math.sqrt((n2.x - n1.x) ** 2 + (n2.y - n1.y) ** 2);
        segments.push({ n1, n2, isFloorChange, length });
    }

    // ---- State for the animation loop ----
    const speed = ROUTE_ANIMATION_SPEED;
    let segIdx = 0;          // current segment index
    let segProgress = 0;     // pixels drawn in current segment
    let lastSwitchedFloor = path[0].floor;

    // Show the starting floor & start marker immediately
    switchFloor(path[0].floor);
    const startCtx = getFloorCtx(path[0].floor);
    renderMarker(startCtx, path[0], '#10b981', 'START');

    // ---- Helpers ----
    function getFloorCtx(floor) {
        return floor === 1 ? ctx1 : ctx2;
    }

    /**
     * Redraw all fully-completed segments plus the current partial one.
     * We repaint every frame so the glow/shadow composites correctly.
     */
    function repaint(currentSegIdx, currentRatio) {
        ctx1.clearRect(0, 0, c1.width, c1.height);
        ctx2.clearRect(0, 0, c2.width, c2.height);

        // Draw all completed segments
        for (let i = 0; i < currentSegIdx; i++) {
            const seg = segments[i];
            if (seg.isFloorChange) {
                renderStairTransition(getFloorCtx(seg.n1.floor), seg.n1);
                renderStairTransition(getFloorCtx(seg.n2.floor), seg.n2);
            } else {
                drawSegment(getFloorCtx(seg.n1.floor), seg.n1, seg.n2, 1);
            }
        }

        // Draw current partial segment
        if (currentSegIdx < segments.length) {
            const seg = segments[currentSegIdx];
            if (!seg.isFloorChange) {
                drawSegment(getFloorCtx(seg.n1.floor), seg.n1, seg.n2, currentRatio);
            }
        }

        // Always redraw the START marker on top
        renderMarker(getFloorCtx(path[0].floor), path[0], '#10b981', 'START');
    }

    // ---- Animation loop ----
    function tick() {
        if (segIdx >= segments.length) {
            // Animation complete – draw DEST marker
            repaint(segments.length, 1);
            const endNode = path[path.length - 1];
            renderMarker(getFloorCtx(endNode.floor), endNode, '#ef4444', 'DEST');
            routeAnimationFrameId = null;
            return;
        }

        const seg = segments[segIdx];

        // Floor-change segments are instant (zero-length)
        if (seg.isFloorChange) {
            renderStairTransition(getFloorCtx(seg.n1.floor), seg.n1);
            renderStairTransition(getFloorCtx(seg.n2.floor), seg.n2);

            // Auto-switch to the new floor so the user can follow
            if (seg.n2.floor !== lastSwitchedFloor) {
                lastSwitchedFloor = seg.n2.floor;
                switchFloor(seg.n2.floor);
            }

            segIdx++;
            segProgress = 0;
            routeAnimationFrameId = requestAnimationFrame(tick);
            return;
        }

        // Advance progress on the current segment
        segProgress += speed;
        const ratio = Math.min(segProgress / seg.length, 1);

        // Auto-switch floor when we start drawing on a new floor
        if (seg.n1.floor !== lastSwitchedFloor) {
            lastSwitchedFloor = seg.n1.floor;
            switchFloor(seg.n1.floor);
        }

        repaint(segIdx, ratio);

        if (ratio >= 1) {
            // Move to next segment
            segIdx++;
            segProgress = 0;
        }

        routeAnimationFrameId = requestAnimationFrame(tick);
    }

    // Kick off the animation
    routeAnimationFrameId = requestAnimationFrame(tick);
}

function renderMarker(ctx, node, color, label) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = "bold 12px Inter";
    const tWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.roundRect(node.x - tWidth / 2 - 8, node.y - 35, tWidth + 16, 20, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, node.x, node.y - 21);
}

function renderStairTransition(ctx, node) {
    ctx.beginPath();
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    ctx.shadowBlur = 15;
    ctx.moveTo(node.x, node.y - 10);
    ctx.lineTo(node.x + 10, node.y);
    ctx.lineTo(node.x, node.y + 10);
    ctx.lineTo(node.x - 10, node.y);
    ctx.fill();
    ctx.shadowBlur = 0;
}

// =====================================================
// TOAST HELPER
// =====================================================
function showToast(message, type = "success") {
    const tc = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = message;
    tc.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

// =====================================================
// EVENT SIDEBAR LOGIC
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    const sidebarContent = document.getElementById('sidebar-content');

    // Handle event card clicks
    if (sidebarContent) {
        sidebarContent.addEventListener('click', (e) => {
            const card = e.target.closest('.event-card');
            if (card) {
                // If the card has data-room, we can auto-fill and navigate
                const roomName = card.getAttribute('data-room');
                if (roomName) {
                    const goalInput = document.getElementById('goal-query');
                    if (goalInput) {
                        goalInput.value = roomName;
                        // Auto-trigger navigation if start is filled
                        const startInput = document.getElementById('start-query');
                        if (startInput && startInput.value.trim() !== '') {
                            navigateUser();
                        } else if (startInput) {
                            startInput.focus();
                        }
                    }
                }
            }
        });
    }
});
