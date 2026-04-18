// A* Priority Queue implementation
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
// SEARCH SUGGESTION SYSTEM
// =====================================================

// Allowlist of node types that are searchable (POI-ready)
const SEARCHABLE_TYPES = ['room', 'stairs', 'toilet', 'elevator', 'cafe', 'lab', 'office'];

// Type-to-icon mapping for search suggestions
const TYPE_ICONS = {
    room: '🚪',
    stairs: '🪜',
    toilet: '🚻',
    elevator: '🛗',
    cafe: '☕',
    lab: '🔬',
    office: '💼'
};

let cachedSearchTerms = null;

/**
 * Extract all searchable terms from graph data.
 * Filters by SEARCHABLE_TYPES allowlist for POI extensibility.
 */
function extractSearchTerms(graphData) {
    if (!graphData || !graphData.nodes) return [];

    return graphData.nodes
        .filter(n => SEARCHABLE_TYPES.includes(n.type))
        .map(n => ({
            name: n.name,
            label: n.label || '',
            type: n.type,
            floor: n.floor,
            id: n.id
        }))
        .sort((a, b) => {
            // Sort rooms numerically, then alphabetically
            const numA = parseFloat(a.name);
            const numB = parseFloat(b.name);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.name.localeCompare(b.name);
        });
}

/**
 * Ensure graph data is loaded. Fetches via API if not already cached.
 * Uses a dummy search query to retrieve the full graph payload.
 */
async function ensureGraphLoaded() {
    if (globalGraphState) return globalGraphState;

    try {
        const baseUrl = window.API_SEARCH_ENDPOINT || 'http://localhost/search';
        const res = await fetch(`${baseUrl}?search=101`, {
            method: 'GET', mode: 'cors',
            headers: { 'Accept': 'application/json' }
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

/**
 * Setup autocomplete for an input field.
 * @param {string} inputId - The input element ID
 * @param {string} listId - The suggestion list element ID
 */
function setupAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    let activeIndex = -1;

    // Don't attach to readonly inputs (QR-locked)
    if (input.readOnly) return;

    // Pre-fetch graph on first focus
    input.addEventListener('focus', async () => {
        await ensureGraphLoaded();
        // Show suggestions if there's already text
        if (input.value.trim()) {
            renderSuggestions(input, list);
        }
    });

    // Real-time filtering on input
    input.addEventListener('input', () => {
        activeIndex = -1;
        renderSuggestions(input, list);
    });

    // Keyboard navigation
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

    // Close on blur (with delay to allow click)
    input.addEventListener('blur', () => {
        setTimeout(() => closeSuggestions(list), 200);
    });
}

function renderSuggestions(input, list) {
    const query = input.value.trim().toLowerCase();
    list.innerHTML = '';
    activeIndex = -1;

    if (!query || !cachedSearchTerms) {
        closeSuggestions(list);
        return;
    }

    const matches = cachedSearchTerms.filter(term =>
        term.name.toLowerCase().includes(query) ||
        term.label.toLowerCase().includes(query)
    ).slice(0, 8);

    if (matches.length === 0) {
        closeSuggestions(list);
        return;
    }

    matches.forEach(term => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';

        const icon = TYPE_ICONS[term.type] || '📍';
        item.innerHTML = `
            <div class="room-name">
                <span class="type-icon">${icon}</span>
                ${term.name}
                <span class="floor-tag">F${term.floor}</span>
            </div>
            ${term.label ? `<div class="room-label">${term.label}</div>` : ''}
        `;

        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur from firing first
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
    items.forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
    if (items[index]) {
        items[index].scrollIntoView({ block: 'nearest' });
    }
}

// =====================================================
// STEP-BY-STEP DIRECTION GENERATOR
// =====================================================

/**
 * Analyze A* path and generate human-readable step-by-step instructions.
 * Consolidates consecutive hallway/junction nodes into single "walk" steps.
 */
function generateInstructions(path) {
    if (!path || path.length < 2) return '';

    const steps = [];
    const startNode = path[0];
    const endNode = path[path.length - 1];

    // Step 1: Start location
    const startName = startNode.type === 'room'
        ? `Room <span class="step-highlight">${startNode.name}</span>`
        : `<span class="step-highlight">${startNode.name}</span>`;
    const startLabel = startNode.label ? ` — ${startNode.label}` : '';
    steps.push({
        icon: '📍',
        text: `Start at ${startName}${startLabel}`,
        type: 'start'
    });

    // Analyze middle path
    let i = 1;
    while (i < path.length - 1) {
        const node = path[i];
        const prevNode = path[i - 1];

        // Detect floor change
        if (node.floor !== prevNode.floor) {
            const stairName = prevNode.type === 'stairs' ? prevNode.name :
                              node.type === 'stairs' ? node.name : 'stairs';
            steps.push({
                icon: '🪜',
                text: `Take <span class="step-highlight">${stairName}</span> to <span class="step-highlight">Floor ${node.floor}</span>`,
                type: 'stairs'
            });
            i++;
            continue;
        }

        // Consolidate hallway/junction/entrance nodes
        if (node.type === 'junction' || node.type === 'entrance' || node.type === 'walk') {
            let walkEnd = i;
            while (walkEnd < path.length - 1) {
                const nextNode = path[walkEnd + 1];
                if (nextNode.floor !== node.floor) break; // Floor change ahead
                if (nextNode.type === 'room' || SEARCHABLE_TYPES.includes(nextNode.type) && nextNode.type !== 'stairs') break; // Reached a destination
                if (nextNode.type === 'stairs') break; // Stairs ahead
                walkEnd++;
            }

            steps.push({
                icon: '🚶',
                text: `Walk along the hallway on <span class="step-highlight">Floor ${node.floor}</span>`,
                type: 'walk'
            });
            i = walkEnd + 1;
            continue;
        }

        // Named POI along the way
        if (SEARCHABLE_TYPES.includes(node.type) && node.type !== 'stairs') {
            steps.push({
                icon: TYPE_ICONS[node.type] || '📍',
                text: `Pass by <span class="step-highlight">${node.name}</span>`,
                type: 'walk'
            });
        }

        i++;
    }

    // Step N: Destination
    const endName = endNode.type === 'room'
        ? `Room <span class="step-highlight">${endNode.name}</span>`
        : `<span class="step-highlight">${endNode.name}</span>`;
    const endLabel = endNode.label ? ` — ${endNode.label}` : '';
    steps.push({
        icon: '🏁',
        text: `Arrive at ${endName}${endLabel}`,
        type: 'end'
    });

    return steps;
}

/**
 * Render the step-by-step directions into the panel.
 */
function renderDirections(steps) {
    const container = document.getElementById('directions-container');
    if (!steps || steps.length === 0) {
        container.classList.remove('active');
        return;
    }

    let html = `
        <div class="directions-header">
            <h3>📋 Directions</h3>
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
            </li>
        `;
    });

    html += '</ol>';
    container.innerHTML = html;
    container.classList.add('active');
}

function closeDirections() {
    document.getElementById('directions-container').classList.remove('active');
}

// =====================================================
// ROUTE SHARING
// =====================================================

/**
 * Copy the current route as a shareable URL to clipboard.
 */
function shareRoute() {
    const startVal = document.getElementById('start-query').value.trim();
    const goalVal = document.getElementById('goal-query').value.trim();

    if (!startVal || !goalVal) {
        showToast('Enter both Start and Goal to share a route.', 'error');
        return;
    }

    const url = new URL(window.location.href.split('?')[0]);
    url.searchParams.set('start', startVal);
    url.searchParams.set('goal', goalVal);

    navigator.clipboard.writeText(url.toString()).then(() => {
        showToast('🔗 Route link copied to clipboard!');
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = url.toString();
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('🔗 Route link copied to clipboard!');
    });
}

// =====================================================
// DOM SETUP
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    // Add interaction hooks
    document.getElementById('badge-floor-1').addEventListener('click', () => switchFloor(1));
    document.getElementById('badge-floor-2').addEventListener('click', () => switchFloor(2));
    
    // Enter key support
    document.getElementById('goal-query').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateUser();
        }
    });
    
    document.getElementById('start-query').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateUser();
        }
    });

    // URL Parameter Detection (QR Code + Route Sharing)
    const urlParams = new URLSearchParams(window.location.search);
    const qrStart = urlParams.get('start');
    const qrGoal = urlParams.get('goal');

    if (qrStart) {
        const startInput = document.getElementById('start-query');
        startInput.value = qrStart;
        startInput.readOnly = true;
        showToast(`📍 Start location auto-detected: ${qrStart}`);
    }

    if (qrGoal) {
        document.getElementById('goal-query').value = qrGoal;
    }

    // Setup autocomplete for both inputs
    setupAutocomplete('start-query', 'start-suggestions');
    setupAutocomplete('goal-query', 'goal-suggestions');

    // If both start and goal are present, auto-navigate
    if (qrStart && qrGoal) {
        showToast('🧭 Shared route detected — navigating...');
        setTimeout(() => navigateUser(), 500);
    } else if (qrStart) {
        document.getElementById('goal-query').focus();
    }

    // Init map based on device type
    initMap();
});

// Detect if the user is on a touchscreen (mobile/tablet)
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

// DESKTOP: Auto-fit the map to the screen on resize
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

// MOBILE: Make the map a fixed-size, pannable/scrollable surface
// The map will NOT snap back when the user pinches or scrolls
function setupMobileMap() {
    const arena = document.getElementById('map-arena');
    
    // Convert arena to a scrollable container
    arena.style.overflow = 'auto';
    arena.style.webkitOverflowScrolling = 'touch';
    arena.style.touchAction = 'pan-x pan-y';
    arena.style.display = 'block';
    arena.style.position = 'relative';
    arena.style.cursor = 'grab';

    // Make each layer static (no transform centering — just block layout inside scroll area)
    document.querySelectorAll('.map-layer').forEach(layer => {
        layer.style.position = 'relative';
        layer.style.top = 'unset';
        layer.style.left = 'unset';
        layer.style.transform = 'none';
        layer.style.display = 'none'; // hide by default; switchFloor manages this
    });

    // Show the starting active floor
    const activeLayer = document.querySelector('.map-layer.active');
    if (activeLayer) activeLayer.style.display = 'block';

    // Override switchFloor to use display instead of class-based opacity
    window._mobileFloorSwitch = true;
}

let currentFloor = 1;
globalGraphState = null;

// Core Logic
async function navigateUser(event) {
    if (event) {
        event.preventDefault();
    }
    
    const goalTerm = document.getElementById('goal-query').value.trim();
    const startTerm = document.getElementById('start-query').value.trim();
    
    if (!goalTerm || !startTerm) {
        showToast("Please enter BOTH a Start and Goal...", "error");
        return;
    }

    try {
        showToast("Calculating points...");
        
        const baseUrl = window.API_SEARCH_ENDPOINT || 'http://localhost/search';
        const startUrl = `${baseUrl}?search=${encodeURIComponent(startTerm)}`;
        const goalUrl  = `${baseUrl}?search=${encodeURIComponent(goalTerm)}`;
        
        // 1. Fetch BOTH locations concurrently from Serverless API
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
        // Refresh suggestion cache when graph is loaded
        cachedSearchTerms = extractSearchTerms(globalGraphState);

        const startNodeId = startData.locations[0].NodeID;
        const targetNodeId = goalData.locations[0].NodeID;
        
        // 2. Perform Client-side Route Calculation
        const path = aStar(startNodeId, targetNodeId, globalGraphState);
        
        if (!path) {
            showToast("No valid route could be constructed.", "error");
            return;
        }

        // 3. Render route on map
        drawRoute(path);
        
        // 4. Generate and render step-by-step directions
        const steps = generateInstructions(path);
        renderDirections(steps);
        
        const resNameStart = startData.locations[0].RoomName || startTerm;
        const resNameGoal = goalData.locations[0].RoomName || goalTerm;
        showToast(`Route: ${resNameStart} ➔ ${resNameGoal}`);
        
    } catch (e) {
        console.error(e);
        showToast(e.message, "error");
    }
}

// Pathfinding Engine
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
        
        if (currentId === goalId) {
            return reconstructPath(cameFrom, currentId, nodes);
        }
        
        const currentEdges = graphData.edges.filter(e => e.from === currentId || e.to === currentId);
        
        for (const edge of currentEdges) {
            const nextId = edge.from === currentId ? edge.to : edge.from;
            
            let edgeWeight = edge.weight || calculateDistance(nodes[currentId], nodes[nextId]);
            if (nodes[currentId].floor !== nodes[nextId].floor) {
                 edgeWeight += STAIRS_WEIGHT;
            }
            
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

// Rendering Engine
function switchFloor(floorNum) {
    currentFloor = floorNum;
    
    document.getElementById('badge-floor-1').classList.toggle('active', floorNum === 1);
    document.getElementById('badge-floor-2').classList.toggle('active', floorNum === 2);

    if (window._mobileFloorSwitch) {
        // Mobile mode: use display show/hide (no opacity/transform tricks)
        const l1 = document.getElementById('layer-floor-1');
        const l2 = document.getElementById('layer-floor-2');
        l1.style.display = floorNum === 1 ? 'block' : 'none';
        l2.style.display = floorNum === 2 ? 'block' : 'none';
    } else {
        // Desktop mode: use class toggling (opacity transition)
        document.getElementById('layer-floor-1').classList.toggle('active', floorNum === 1);
        document.getElementById('layer-floor-2').classList.toggle('active', floorNum === 2);
    }
}

function drawRoute(path) {
    const c1 = document.getElementById('canvas-floor-1');
    const c2 = document.getElementById('canvas-floor-2');
    const ctx1 = c1.getContext('2d');
    const ctx2 = c2.getContext('2d');
    
    ctx1.clearRect(0, 0, c1.width, c1.height);
    ctx2.clearRect(0, 0, c2.width, c2.height);
    
    if (path.length === 0) return;
    
    // Pre-parse the segments by floor
    const floorPaths = { 1: [], 2: [] };
    
    for (let i = 0; i < path.length - 1; i++) {
        const n1 = path[i];
        const n2 = path[i+1];
        
        if (n1.floor === n2.floor) {
             floorPaths[n1.floor].push([n1, n2]);
        } else {
             renderStairTransition(ctx1, n1);
             renderStairTransition(ctx2, n2);
        }
    }
    
    renderLineSegments(ctx1, floorPaths[1]);
    renderLineSegments(ctx2, floorPaths[2]);
    
    // Render distinct bounds
    renderMarker(document.getElementById(`canvas-floor-${path[0].floor}`).getContext('2d'), path[0], '#10b981', 'START');
    renderMarker(document.getElementById(`canvas-floor-${path[path.length-1].floor}`).getContext('2d'), path[path.length-1], '#ef4444', 'DEST');

    // Go to Start floor view automatically
    switchFloor(path[0].floor);
}

function renderLineSegments(ctx, segments) {
    if (segments.length === 0) return;
    
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
    ctx.shadowBlur = 10;
    
    for (const [n1, n2] of segments) {
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
}

function renderMarker(ctx, node, color, label) {
    // Circle base
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Outer Ring
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.arc(node.x, node.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Text Label Background
    ctx.font = "bold 12px Inter";
    const tWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.roundRect(node.x - tWidth/2 - 8, node.y - 35, tWidth + 16, 20, 6);
    ctx.fill();

    // Text Label Data
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, node.x, node.y - 21);
}

function renderStairTransition(ctx, node) {
    ctx.beginPath();
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    ctx.shadowBlur = 15;
    // Draw diamond for stairs
    ctx.moveTo(node.x, node.y - 10);
    ctx.lineTo(node.x + 10, node.y);
    ctx.lineTo(node.x, node.y + 10);
    ctx.lineTo(node.x - 10, node.y);
    ctx.fill();
    ctx.shadowBlur = 0;
}

// GUI Toast helper
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
