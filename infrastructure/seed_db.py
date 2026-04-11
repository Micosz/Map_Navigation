import boto3
import json
import os

# Connect to DynamoDB
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
# Using the exact table name we created in aws_setup.ps1
table = dynamodb.Table('LocationData')

# ---------------------------------------------------------------------------
# Room name metadata
#   Floor 1 keys: plain room numbers  e.g. "101", "122/1"
#   Floor 2 keys: prefixed with "F2_" e.g. "F2_201", "F2_223/1"
#   (These keys are derived by stripping the "LC3_" prefix from a node ID.)
# ---------------------------------------------------------------------------
ROOM_NAMES = {
    # ── Floor 1 ─────────────────────────────────────────────────────────────
    "101": "Faculty Offices (Mathematics and Statistics)",
    "101/1": "Lecture Room 4 (Environmental Science)",
    "101/2": "Graduate Seminar Room (Mathematics and Statistics)",
    "102/1": "Graduate Seminar Room (Mathematics and Statistics)",
    "102/2": "Graduate Seminar Room (Mathematics and Statistics)",
    "103": "Lecture Room",
    "104": "Lecture Room",
    "104/1": "Graduate Common Room (Environmental Science)",
    "105": "Lecture Room",
    "106": "Lecture Room",
    "107": "Lecture Room",
    "108": "Lecture Room",
    "108/1": "Staff Room",
    "109": "Lecture Room",
    "110": "Lecture Room",
    "111": "Lecture Room",
    "115": "Seminar in Mathematics and Statistics Room",
    "116": "Lecture Room",
    "117": "Lecture Room",
    "118": "Lecture Room",
    "118/1": "Lecture Room",
    "119": "Faculty Offices (Mathematics and Statistics)",
    "119/1": "Faculty Offices (Mathematics and Statistics)",
    "119/2": "Faculty Offices (Mathematics and Statistics)",
    "119/3": "Faculty Offices (Mathematics and Statistics)",
    "119/4": "Faculty Offices (Mathematics and Statistics)",
    "119/5": "Faculty Offices (Mathematics and Statistics)",
    "120": "Storage Room",
    "121": "Lecture Room",
    "121/1": "Faculty Offices (Mathematics and Statistics)",
    "121/2": "Faculty Offices (Mathematics and Statistics)",
    "121/3": "Faculty Offices (Mathematics and Statistics)",
    "121/4": "Statistical Consulting for Research Service Room",
    "121/5": "Faculty Offices (Physics)",
    "122": "Lecture Room",
    "122/1": "Staff Room",
    "122/2": "Faculty Offices (Mathematics and Statistics)",
    "122/3": "Faculty Offices (Mathematics and Statistics)",
    "122/4": "Faculty Offices (Mathematics and Statistics)",
    "122/5": "Faculty Offices (Mathematics and Statistics)",
    "122/6": "Faculty Offices (Mathematics and Statistics)",
    "123": "Faculty Offices (Physics)",
    "123/1": "Faculty Offices (Physics)",
    "124/1": "Plasma and Nuclear Fusion Lab",
    "124/2": "Plasma and Nuclear Fusion Lab",
    "125": "Storage Room",
    "125/1": "Storage Room",
    "126": "Faculty of Science and Technology Student Affairs Office",
    "127": "Faculty Offices (Physics)",
    "128": "Electronic Lab",
    "129": "Electronic Lab",
    "130": "Storage Room",
    "131": "Storage Room",
    "132": "Electricity Control Room",
    "135/1": "Faculty Offices (Physics)",
    "135/2": "Faculty Offices (Physics)",
    "135/3": "Faculty Offices (Physics)",
    "136": "Faculty Offices (Physics)",
    "136/1": "Faculty Offices (Physics)",
    "136/2": "Faculty Offices (Physics)",
    "136/3": "Faculty Offices (Physics)",
    "136/4": "Faculty Offices (Physics)",
    "137/1": "Physics Lab",
    "137/2": "Physics Lab",
    "137/3": "Physics Lab",
    "138": "Faculty Offices (Physics)",
    "139": "Physics Research Lab",
    "140": "Electronic Lab",
    "141": "Electronic Lab",

    # ── Floor 2 ─────────────────────────────────────────────────────────────
    "F2_201": "Mathematics and Statistics Department Office",
    "F2_202/1": "Graduate Seminar Room (Mathematics and Statistics)",
    "F2_202/2": "Graduate Seminar Room (Mathematics and Statistics)",
    "F2_203": "Wastewater Treatment Lab",
    "F2_204": "Wastewater Treatment Lab Preparation Room",
    "F2_205": "Ecology and Environmental Arts Lab",
    "F2_206": "Marine, Coastal, and Estuarine Ecology Lab",
    "F2_207": "Marine Biology Lab Preparation Room",
    "F2_208": "Marine Biology Lab",
    "F2_209": "Soil Environmental Science Lab",
    "F2_210/1": "Room 210/1",
    "F2_211/1": "Room 211/1",
    "F2_211/2": "Room 211/2",
    "F2_212": "Freshwater Quality Analysis Preparation Lab",
    "F2_213": "Freshwater Quality Analysis Lab",
    "F2_217": "Faculty Offices (Mathematics, Statistics and Others)",
    "F2_220": "Faculty Offices (Mathematics and Statistics)",
    "F2_221": "Graduate Common Room (Environmental Science)",
    "F2_222": "Mathematics and Statistics Lab",
    "F2_223/1": "Faculty Offices (Environmental Science)",
    "F2_223/2": "Faculty Offices (Environmental Science)",
    "F2_223/3": "Faculty Offices (Environmental Science)",
    "F2_223/4": "Faculty Offices (Environmental Science)",
    "F2_223/5": "Faculty Offices (Environmental Science)",
    "F2_223/6": "Faculty Offices (Environmental Science)",
    "F2_223/7": "Faculty Offices (Environmental Science)",
    "F2_223/8": "Faculty Offices (Environmental Science)",
    "F2_223/9": "Faculty Offices (Environmental Science)",
    "F2_223/10": "Faculty Offices (Environmental Science)",
    "F2_223/11": "Faculty Offices (Environmental Science)",
    "F2_223/12": "Faculty Offices (Environmental Science)",
    "F2_224": "Computer Lab (Environmental Science)",
    "F2_225": "Mathematics and Statistics Department Meeting Room",
    "F2_226/1": "Control Room",
    "F2_226/2": "Control Room",
    "F2_227": "Mathematics and Statistics Department Seminar Room",
    "F2_227/1": "Mathematics and Statistics Department Seminar Room",
    "F2_228": "Storage Room",
    "F2_229": "Storage Room",
    "F2_230": "Conference / Lecture Room 1",
    "F2_233": "Lecture Room 2",
    "F2_234": "Conference / Lecture Room 3",
    "F2_234/1": "Conference / Lecture Room 3",
    "F2_235/1": "Freshwater Ecology Lab",
    "F2_235/2": "Freshwater Ecology Lab",
    "F2_235/3": "Freshwater Ecology Lab",
    "F2_236/1": "Urban / Community Lab",
    "F2_236/2": "Environmental Science Department Office",
    "F2_236/3": "Environmental Science Department Office",
    "F2_237": "Forest Ecology Lab and Faculty Office",
    "F2_238": "Forest Ecology Lab",
    "F2_239": "Air and Noise Pollution Lab",
    "F2_240": "Heavy Metal Analysis Lab (AAS)",
    "F2_241": "Water and Wastewater Analysis Lab",
    "F2_242": "GC/HPLC Instrument Lab",
    "F2_243/1": "Bacteriology Lab",
    "F2_243/2": "Environmental Toxicology Lab",
}

# ---------------------------------------------------------------------------
# Course → room number mapping
# ---------------------------------------------------------------------------
COURSES = {
    # Floor 1 courses
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
    # Floor 2 courses  (prefix room numbers with "F2_")
    "ENV310 Sec 1": "F2_203",
    "ENV210 Sec 1": "F2_206",
    "ENV215 Sec 1": "F2_208",
    "MTH301 Sec 1": "F2_222",
    "ENV401 Sec 1": "F2_239",
    "ENV320 Sec 1": "F2_241",
    "ENV330 Sec 1": "F2_242",
    "ENV340 Sec 1": "F2_243/1",
}

# ---------------------------------------------------------------------------
# Events → room number mapping
# ---------------------------------------------------------------------------
EVENTS = {
    "Science Faculty Townhall": "135/1",
    "Science Project Pitching": "135/1",
    "Electronics Lab Safety Training": "141",
    "Sci-Tech Hackathon 2026": "141",
    "\u0e25\u0e2d\u0e07\u0e0a\u0e38\u0e14\u0e0a\u0e47\u0e2d\u0e1b\u0e04\u0e13\u0e30\u0e27\u0e34\u0e17\u0e22\u0e32\u0e28\u0e32\u0e2a\u0e15\u0e23\u0e4c": "126",
    "\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e0a\u0e21\u0e23\u0e21\u0e04\u0e13\u0e30\u0e27\u0e34\u0e14\u0e22\u0e32": "126",
    "Environmental Science Orientation": "F2_236/2",
    "Graduate Research Symposium": "F2_230",
}

# ---------------------------------------------------------------------------
# Dynamically load the full graph data
# ---------------------------------------------------------------------------
print("Loading graph.json...")
graph_path = os.path.join(os.path.dirname(__file__), 'graph.json')
with open(graph_path, 'r', encoding='utf-8') as f:
    MAP_DATA = json.load(f)

node_id_lookup = {node["id"]: node for node in MAP_DATA["nodes"]}

# Build room → nearest hallway/entry node mapping from edges
room_entry_map = {}
for edge in MAP_DATA["edges"]:
    u, v = edge.get("from", ""), edge.get("to", "")

    u_is_room = u in node_id_lookup and node_id_lookup[u].get("type") == "room"
    v_is_room = v in node_id_lookup and node_id_lookup[v].get("type") == "room"

    if u_is_room and not v_is_room:
        room_entry_map[u] = v
    elif v_is_room and not u_is_room:
        room_entry_map[v] = u


def _room_key_to_node_id(room_key: str) -> str:
    """Convert a ROOM_NAMES / COURSES / EVENTS dict key to a graph node ID.

    Floor 1 key  : "101"    → "LC3_101"
    Floor 2 key  : "F2_201" → "LC3_F2_201"
    """
    return f"LC3_{room_key}"


def get_location_details(room_key: str):
    """Return (x, y, node_id, entry_node) for a room key."""
    node_id = _room_key_to_node_id(room_key)
    if node_id in node_id_lookup and node_id_lookup[node_id].get("type") == "room":
        node = node_id_lookup[node_id]
        x = str(node.get("x", 0))
        y = str(node.get("y", 0))
        entry_node = room_entry_map.get(node_id, "Pending")
        return x, y, node_id, entry_node
    return "0.0", "0.0", node_id, "Pending"


def get_floor(room_key: str) -> str:
    """Derive floor number from the room key."""
    return "2" if room_key.startswith("F2_") else "1"


def bare_room_num(room_key: str) -> str:
    """Return the plain room number people would actually type.

    Floor 1: "101"    → "101"
    Floor 2: "F2_201" → "201"
    """
    return room_key.replace("F2_", "", 1)


# ---------------------------------------------------------------------------
# Upload to DynamoDB
# ---------------------------------------------------------------------------
print("Uploading data to DynamoDB. This may take a moment...")
print(f"Target table: {table.name}")

with table.batch_writer() as batch:

    # 1 & 2.  Write every node in the graph (rooms + structural nodes)
    print("Writing Room & Node Metadata...")
    for node in MAP_DATA["nodes"]:
        node_id = node["id"]

        if node.get("type") == "room":
            # Derive the room_key (strip the "LC3_" prefix)
            room_key = node_id.replace("LC3_", "", 1)

            # Use ROOM_NAMES if available, otherwise fall back to the graph label
            if room_key in ROOM_NAMES:
                room_name = ROOM_NAMES[room_key]
            else:
                room_name = node.get("label", node.get("name", "Unknown Room"))

            x_val, y_val, nid, entry_node = get_location_details(room_key)

            batch.put_item(Item={
                "SearchTerm": bare_room_num(room_key),
                "Detail": "ROOM",
                "NodeID": node_id,
                "NodeEntry": entry_node,
                "RoomNumber": f"LC3-{room_key}",
                "RoomName": room_name,
                "Floor": str(node.get("floor", 1)),
                "X": x_val,
                "Y": y_val,
                "NodeType": "room",
            })
        else:
            # Structural nodes: stairs, junctions, entrances, etc.
            batch.put_item(Item={
                "SearchTerm": node["id"],
                "Detail": "NODE",
                "NodeID": node["id"],
                "NodeEntry": node["id"],
                "RoomNumber": node.get("name", ""),
                "RoomName": str(node.get("type", "")).capitalize(),
                "Floor": str(node.get("floor", 1)),
                "X": str(node.get("x", 0)),
                "Y": str(node.get("y", 0)),
                "NodeType": node.get("type", ""),
            })

    # 3.  Course definitions
    print("Writing Course mapping metadata...")
    for course, room_key in COURSES.items():
        x, y, nid, entry = get_location_details(room_key)
        batch.put_item(Item={
            "SearchTerm": course,
            "Detail": "COURSE",
            "NodeID": nid,
            "NodeEntry": entry,
            "RoomNumber": f"LC3-{room_key}",
            "RoomName": ROOM_NAMES.get(room_key, "Lecture Room"),
            "Floor": get_floor(room_key),
            "X": x,
            "Y": y,
            "NodeType": "room",
        })

    # 4.  Scheduled events
    print("Writing Event scheduling metadata...")
    for event, room_key in EVENTS.items():
        x, y, nid, entry = get_location_details(room_key)
        batch.put_item(Item={
            "SearchTerm": event,
            "Detail": "EVENT",
            "NodeID": nid,
            "NodeEntry": entry,
            "RoomNumber": f"LC3-{room_key}",
            "RoomName": ROOM_NAMES.get(room_key, "Event Room"),
            "Floor": get_floor(room_key),
            "X": x,
            "Y": y,
            "NodeType": "room",
        })

print("\nDatabase Seeding Successfully Completed!")
