"""
seed_db.py - Seeds DynamoDB from graph.json + search_metadata.json

Reads building graph data and supplementary search metadata (courses,
events) to populate the LocationData DynamoDB table with a unified
4-category search index: room, course, event, and structural nodes.

Usage:
    cd infrastructure
    python seed_db.py
"""

import boto3
import json
import os
import sys

# Fix Windows console encoding for Thai text output
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# =========================================================================
# CONFIGURATION
# =========================================================================
AWS_REGION = "us-east-1"
TABLE_NAME = "LocationData"

# Node types that should be indexed as searchable POIs in DynamoDB
SEEDABLE_TYPES = {"room", "stairs", "toilet", "elevator", "cafe", "lab", "office", "facility"}

# QR Code Entry Points — these structural nodes are indexed by their
# friendly name (e.g. 'Junction_SM') so that QR links like
# ?start=Junction_SM resolve correctly via the search API.
QR_ENTRY_POINTS = {
    "Junction_SM",
    "entry_TLLF",
    "Junction_NM1",
    "Junction_SR1",
    "hallway-5",
    "hallway-16",
    "hallway-10",
    "hallway-12",
}

# =========================================================================
# LOAD DATA FILES
# =========================================================================
print("=" * 60)
print("  DynamoDB Seeder — 4-Category Search Index")
print("=" * 60)

base_dir = os.path.dirname(os.path.abspath(__file__))

# --- graph.json (required) ---
graph_path = os.path.join(base_dir, "graph.json")
if not os.path.exists(graph_path):
    print(f"  FATAL: graph.json not found at {graph_path}")
    sys.exit(1)

with open(graph_path, "r", encoding="utf-8") as f:
    MAP_DATA = json.load(f)

# --- search_metadata.json (optional — courses & events) ---
metadata_path = os.path.join(base_dir, "search_metadata.json")
SEARCH_METADATA = []
if os.path.exists(metadata_path):
    with open(metadata_path, "r", encoding="utf-8") as f:
        SEARCH_METADATA = json.load(f)
    print(f"  Metadata : {len(SEARCH_METADATA)} entries loaded from search_metadata.json")
else:
    print("  Metadata : search_metadata.json not found (skipping)")

nodes = MAP_DATA.get("nodes", [])
edges = MAP_DATA.get("edges", [])
building = MAP_DATA.get("building", "LC3")

print(f"  Building : {building}")
print(f"  Nodes    : {len(nodes)}")
print(f"  Edges    : {len(edges)}")

# =========================================================================
# BUILD LOOKUP MAPS
# =========================================================================
node_by_id = {n["id"]: n for n in nodes}

# Map each room node to its best non-room neighbour (entry point for A*)
room_entry_map = {}
for edge in edges:
    u, v = edge.get("from", ""), edge.get("to", "")
    u_node = node_by_id.get(u)
    v_node = node_by_id.get(v)
    if not u_node or not v_node:
        continue
    if u_node.get("type") == "room" and v_node.get("type") != "room":
        room_entry_map.setdefault(u, v)
    elif v_node.get("type") == "room" and u_node.get("type") != "room":
        room_entry_map.setdefault(v, u)


def bare_room_name(node):
    """Return the short display name of a node (e.g. '204')."""
    return node.get("name", node["id"])


def resolve_node(identifier):
    """Resolve a node by ID first, then by name. Returns the node dict or None."""
    if identifier in node_by_id:
        return node_by_id[identifier]
    # Fallback: search by node name
    for n in nodes:
        if n.get("name") == identifier:
            return n
    return None

# =========================================================================
# CONNECT TO DYNAMODB & CLEAR OLD DATA
# =========================================================================
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)

print(f"\n  Target   : {TABLE_NAME} ({AWS_REGION})")
print("  Clearing old data...")

scan_response = table.scan()
old_items = scan_response.get("Items", [])

while scan_response.get("LastEvaluatedKey"):
    scan_response = table.scan(ExclusiveStartKey=scan_response["LastEvaluatedKey"])
    old_items.extend(scan_response.get("Items", []))

deleted = 0
with table.batch_writer() as batch:
    for item in old_items:
        key = {"SearchTerm": item["SearchTerm"]}
        if "Detail" in item:
            key["Detail"] = item["Detail"]
        batch.delete_item(Key=key)
        deleted += 1

print(f"  Deleted  : {deleted} old records")

# =========================================================================
# SEED NEW DATA
# =========================================================================
print("\n  Seeding new data...\n")

room_count = 0
structural_count = 0
course_count = 0
event_count = 0

with table.batch_writer() as batch:

    # -----------------------------------------------------------------
    # 1) ROOMS & POIs from graph.json
    # -----------------------------------------------------------------
    for node in nodes:
        node_id = node["id"]
        node_type = node.get("type", "")
        floor = str(node.get("floor", 1))

        if node_type in SEEDABLE_TYPES:
            search_name = bare_room_name(node)
            label = node.get("label", "")
            entry_node = room_entry_map.get(node_id, node_id)
            detail = "ROOM" if node_type == "room" else "POI"

            batch.put_item(Item={
                "SearchTerm": search_name,
                "Detail": detail,
                "NodeID": node_id,
                "NodeEntry": entry_node,
                "RoomNumber": f"{building}-{search_name}",
                "RoomName": label if label else search_name,
                "Floor": floor,
                "X": str(node.get("x", 0)),
                "Y": str(node.get("y", 0)),
                "NodeType": node_type,
                "category": "room",
            })
            room_count += 1
        else:
            # Structural / QR entry-point nodes
            node_name = node.get("name", node_id)
            search_key = node_name if node_name in QR_ENTRY_POINTS else node_id

            batch.put_item(Item={
                "SearchTerm": search_key,
                "Detail": "NODE",
                "NodeID": node_id,
                "NodeEntry": node_id,
                "RoomNumber": node_name,
                "RoomName": node_type.capitalize() if node_type else "Node",
                "Floor": floor,
                "X": str(node.get("x", 0)),
                "Y": str(node.get("y", 0)),
                "NodeType": node_type,
            })
            structural_count += 1

    # -----------------------------------------------------------------
    # 2) COURSES & EVENTS from search_metadata.json
    # -----------------------------------------------------------------
    for entry in SEARCH_METADATA:
        cat = entry.get("category", "")
        raw_node_id = entry.get("node_id", "")

        if not raw_node_id:
            continue

        target_node = resolve_node(raw_node_id)
        if not target_node:
            print(f"  [MISSING] {cat} → node '{raw_node_id}' not found in graph.")
            continue

        nid = target_node["id"]
        entry_node = room_entry_map.get(nid, nid)
        target_name = bare_room_name(target_node)
        floor = str(target_node.get("floor", 1))

        if cat == "course":
            course_id = entry.get("course_id", "")
            sec = entry.get("sec", "")
            search_term = f"{course_id} Sec {sec}"
            detail = "COURSE"

            batch.put_item(Item={
                "SearchTerm": search_term,
                "Detail": detail,
                "NodeID": nid,
                "NodeEntry": entry_node,
                "RoomNumber": f"{building}-{target_name}",
                "RoomName": target_node.get("label", search_term),
                "Floor": floor,
                "X": str(target_node.get("x", 0)),
                "Y": str(target_node.get("y", 0)),
                "NodeType": target_node.get("type", "room"),
                "category": "course",
            })
            course_count += 1

        elif cat == "event":
            event_name = entry.get("name", "")
            if not event_name:
                continue
            detail = "EVENT"

            batch.put_item(Item={
                "SearchTerm": event_name,
                "Detail": detail,
                "NodeID": nid,
                "NodeEntry": entry_node,
                "RoomNumber": f"{building}-{target_name}",
                "RoomName": target_node.get("label", event_name),
                "Floor": floor,
                "X": str(target_node.get("x", 0)),
                "Y": str(target_node.get("y", 0)),
                "NodeType": target_node.get("type", "room"),
                "category": "event",
            })
            event_count += 1

        else:
            print(f"  [SKIP] Unknown category '{cat}' for node '{raw_node_id}'")

# =========================================================================
# SUMMARY
# =========================================================================
total = room_count + structural_count + course_count + event_count
print("=" * 60)
print(f"  SUCCESS: Database Seeding Complete!")
print("")
print(f"  🚪  Room / POI records : {room_count}")
print(f"  🔧  Structural nodes   : {structural_count}")
print(f"  📚  Course records     : {course_count}")
print(f"  📅  Event records      : {event_count}")
print(f"  -----------------------------")
print(f"  Total inserted         : {total}")
print("=" * 60)
