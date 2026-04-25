"""
seed_db.py - Dynamically seeds DynamoDB from graph.json

Reads all nodes from infrastructure/graph.json and generates DynamoDB
metadata for every node whose type is in SEEDABLE_TYPES.

Usage:
    cd infrastructure
    python seed_db.py
"""

import boto3
import json
import os
import sys

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
# OPTIONAL: Course & Event overlays
# =========================================================================
COURSES = {
    "ENV101 Sec 1": "101/2",
    "ENV102 Sec 1": "102/1",
    "ENV205 Sec 2": "102/2",
    "ENV301 Sec 1": "103",
    "CHM101 Sec 3": "104",
    "ENV402 Sec 1": "105",
    "MTH101 Sec 2": "106",
    "STA201 Sec 1": "107",
    "PHY101 Sec 4": "108",
    "CS265 Sec 1": "109",
    "CS251 Sec 2": "110",
    "CS262 Sec 1": "111",
    "MTH202 Sec 1": "116",
    "PHY102 Sec 2": "117",
    "CS271 Sec 1": "118",
    "STA202 Sec 2": "118/1",
    "CS232 Sec 1": "121",
    "CS101 Sec 1": "122",
    "ENV310 Sec 1": "203",
    "ENV210 Sec 1": "206",
    "ENV215 Sec 1": "208",
    "MTH301 Sec 1": "222",
    "ENV401 Sec 1": "239",
    "ENV320 Sec 1": "241",
    "ENV330 Sec 1": "242",
    "ENV340 Sec 1": "243/1",
}

EVENTS = {
    "Science Faculty Townhall": "135/1",
    "Science Project Pitching": "135/1",
    "Electronics Lab Safety Training": "141",
    "Sci-Tech Hackathon 2026": "141",
    "ลองชุดช็อปคณะวิทยาศาสตร์": "126",
    "ลงทะเบียนชมรมคณะวิดยา": "126",
    "Environmental Science Orientation": "236/2",
    "Graduate Research Symposium": "230",
}

# =========================================================================
# LOAD GRAPH DATA
# =========================================================================
print("=" * 60)
print("  DynamoDB Seeder - Reading from graph.json")
print("=" * 60)

graph_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "graph.json")
if not os.path.exists(graph_path):
    print(f"FAILED: graph.json not found at {graph_path}")
    sys.exit(1)

with open(graph_path, "r", encoding="utf-8") as f:
    MAP_DATA = json.load(f)

nodes = MAP_DATA.get("nodes", [])
edges = MAP_DATA.get("edges", [])
building = MAP_DATA.get("building", "LC3")

print(f"  Building : {building}")
print(f"  Nodes    : {len(nodes)}")
print(f"  Edges    : {len(edges)}")

node_by_id = {n["id"]: n for n in nodes}

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
    return node.get("name", node["id"])

def find_node_by_room_number(room_number):
    for node in nodes:
        if node.get("name") == room_number:
            return node
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
            })
            room_count += 1
        else:
            # For QR entry points, use the friendly name as SearchTerm
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

    for course_name, room_number in COURSES.items():
        target_node = find_node_by_room_number(room_number)
        if target_node:
            node_id = target_node["id"]
            entry_node = room_entry_map.get(node_id, node_id)
            batch.put_item(Item={
                "SearchTerm": course_name,
                "Detail": "COURSE",
                "NodeID": node_id,
                "NodeEntry": entry_node,
                "RoomNumber": f"{building}-{room_number}",
                "RoomName": target_node.get("label", course_name),
                "Floor": str(target_node.get("floor", 1)),
                "X": str(target_node.get("x", 0)),
                "Y": str(target_node.get("y", 0)),
                "NodeType": "room",
            })
            course_count += 1
        else:
            print(f"  [MISSING] Course '{course_name}' -> room '{room_number}' not found.")

    for event_name, room_number in EVENTS.items():
        target_node = find_node_by_room_number(room_number)
        if target_node:
            node_id = target_node["id"]
            entry_node = room_entry_map.get(node_id, node_id)
            batch.put_item(Item={
                "SearchTerm": event_name,
                "Detail": "EVENT",
                "NodeID": node_id,
                "NodeEntry": entry_node,
                "RoomNumber": f"{building}-{room_number}",
                "RoomName": target_node.get("label", event_name),
                "Floor": str(target_node.get("floor", 1)),
                "X": str(target_node.get("x", 0)),
                "Y": str(target_node.get("y", 0)),
                "NodeType": "room",
            })
            event_count += 1
        else:
            print(f"  [MISSING] Event '{event_name}' -> room '{room_number}' not found.")

# =========================================================================
# SUMMARY
# =========================================================================
total = room_count + structural_count + course_count + event_count
print("=" * 60)
print(f"  SUCCESS: Database Seeding Complete!")
print("")
print(f"  POI/Room records   : {room_count}")
print(f"  Structural nodes   : {structural_count}")
print(f"  Course records     : {course_count}")
print(f"  Event records      : {event_count}")
print(f"  -----------------------------")
print(f"  Total inserted     : {total}")
print("=" * 60)
