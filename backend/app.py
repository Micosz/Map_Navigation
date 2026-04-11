import json
import math
import heapq
import os

STAIRS_WEIGHT = 15.0

def euclidean_distance(n1, n2):
    return math.sqrt((n1['x'] - n2['x'])**2 + (n1['y'] - n2['y'])**2)

def heuristic(n1, n2):
    dist = math.sqrt((n1['x'] - n2['x'])**2 + (n1['y'] - n2['y'])**2)
    # Penalize floor differences to ensure accurate A* estimation
    dist += abs(n1['floor'] - n2['floor']) * STAIRS_WEIGHT
    return dist

def a_star(start_id, goal_id, graph_nodes):
    open_set = []
    heapq.heappush(open_set, (0.0, start_id))
    
    came_from = {}
    
    # Initialize path scores
    g_score = {node_id: float('inf') for node_id in graph_nodes}
    g_score[start_id] = 0.0
    
    f_score = {node_id: float('inf') for node_id in graph_nodes}
    f_score[start_id] = heuristic(graph_nodes[start_id], graph_nodes[goal_id])
    
    open_set_hash = {start_id}
    
    while open_set:
        current_f, current_id = heapq.heappop(open_set)
        open_set_hash.remove(current_id)
        
        if current_id == goal_id:
            return reconstruct_path(came_from, current_id)
            
        current_node = graph_nodes[current_id]
        
        for neighbor_id in current_node.get('neighbors', []):
            if neighbor_id not in graph_nodes:
                continue
                
            neighbor_node = graph_nodes[neighbor_id]
            
            # Constraint 1: Stay within building
            # Constraint 2: Floor transitions use stairs weight
            if current_node['floor'] != neighbor_node['floor']:
                dist = STAIRS_WEIGHT
            else:
                dist = euclidean_distance(current_node, neighbor_node)
                
            tentative_g_score = g_score[current_id] + dist
            
            if tentative_g_score < g_score[neighbor_id]:
                came_from[neighbor_id] = current_id
                g_score[neighbor_id] = tentative_g_score
                f_score[neighbor_id] = tentative_g_score + heuristic(neighbor_node, graph_nodes[goal_id])
                
                if neighbor_id not in open_set_hash:
                    heapq.heappush(open_set, (f_score[neighbor_id], neighbor_id))
                    open_set_hash.add(neighbor_id)
                    
    return None

def reconstruct_path(came_from, current_id):
    total_path = [current_id]
    while current_id in came_from:
        current_id = came_from[current_id]
        total_path.insert(0, current_id)
    return total_path

def lambda_handler(event, context):
    """
    AWS Lambda Handler finding shortest path in multi-floor building.
    """
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    }

    try:
        body_str = event.get('body', '{}')
        body = body_str if isinstance(body_str, dict) else (json.loads(body_str) if body_str else {})
            
        start_id = body.get('start_id')
        goal_id = body.get('goal_id')
        
        if not start_id or not goal_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'start_id and goal_id parameters are required'})
            }
            
        # Support various deploy structures 
        graph_path = os.environ.get('GRAPH_PATH', 'infrastructure/graph.json')
        if not os.path.exists(graph_path) and os.path.exists('../infrastructure/graph.json'):
            graph_path = '../infrastructure/graph.json'
            
        with open(graph_path, 'r') as f:
            graph_data = json.load(f)
            
        nodes_dict = {node['id']: node for node in graph_data.get('nodes', [])}
        
        if start_id not in nodes_dict or goal_id not in nodes_dict:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'error': 'Start or goal node not mapped in graph.json'})
            }
            
        path_ids = a_star(start_id, goal_id, nodes_dict)
        
        if path_ids:
            # Enriched data for frontend map rendering
            path_nodes = [nodes_dict[n_id] for n_id in path_ids]
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'path_ids': path_ids, 'path_nodes': path_nodes})
            }
        else:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'error': 'No valid route found'})
            }
            
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal configuration error', 'details': str(e)})
        }
