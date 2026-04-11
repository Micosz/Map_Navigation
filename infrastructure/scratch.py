import json

path = 'c:\\Project\\Map_Navigation\\infrastructure\\graph.json'
with open(path, 'r', encoding='utf-8') as f:
    d = json.load(f)

is_room = {n['id']: (n['type'] == 'room') for n in d['nodes']}
initial_edges = len(d['edges'])

clean_edges = []
for e in d['edges']:
    # if BOTH nodes are rooms, it's a shortcut edge breaching a wall!
    if is_room.get(e.get('from', ''), False) and is_room.get(e.get('to', ''), False):
        continue
    clean_edges.append(e)

d['edges'] = clean_edges

with open(path, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2)

print(f"Graph scrubbed. Total broken room shortcuts removed: {initial_edges - len(clean_edges)}")
