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

// DOM Setup
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

    // Auto-scale map on load
    resizeMap();
});

window.addEventListener('resize', resizeMap);

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
        const startNodeId = startData.locations[0].NodeID;
        const targetNodeId = goalData.locations[0].NodeID;
        
        // 2. Perform Client-side Route Calculation
        const path = aStar(startNodeId, targetNodeId, globalGraphState);
        
        if (!path) {
            showToast("No valid route could be constructed.", "error");
            return;
        }

        // 3. Render
        drawRoute(path);
        
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
    document.getElementById('layer-floor-1').classList.toggle('active', floorNum === 1);
    document.getElementById('layer-floor-2').classList.toggle('active', floorNum === 2);
    document.getElementById('badge-floor-1').classList.toggle('active', floorNum === 1);
    document.getElementById('badge-floor-2').classList.toggle('active', floorNum === 2);
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
