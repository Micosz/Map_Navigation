import json
import boto3
import logging
from decimal import Decimal
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Note: The bucket name can be dynamic using Environment variables,
# or updated based on the generated unique id from the setup script.
DATA_BUCKET = os.environ.get('DATA_BUCKET', 'indoor-nav-data-your-unique-name')

def lambda_handler(event, context):
    try:
        # Parse the request
        if event.get('httpMethod') == 'GET':
            query_params = event.get('queryStringParameters', {}) or {}
            search_term = query_params.get('search', '')
        else:  # POST
            body = json.loads(event.get('body', '{}'))
            search_term = body.get('search', '')
            
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        }
        
        if not search_term:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Search term is required'})
            }
        
        # Query DynamoDB - use scan and Python filtering for partial, case-insensitive match
        table = dynamodb.Table('LocationData')
        response = table.scan()
        all_items = response.get('Items', [])
        
        # Handle pagination if necessary
        while 'LastEvaluatedKey' in response:
            response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            all_items.extend(response.get('Items', []))
            
        items = [
            item for item in all_items 
            if search_term.lower() in item.get('SearchTerm', '').lower()
        ]

        
        if not items:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'error': 'Location not found'})
            }
        
        # Get graph data from S3
        try:
            graph_response = s3_client.get_object(
                Bucket=DATA_BUCKET,
                Key='graph.json'
            )
            graph_data = json.loads(graph_response['Body'].read())
        except Exception as e:
            logger.error(f"Error fetching graph data from bucket {DATA_BUCKET}: {str(e)}")
            graph_data = {}
        
        # Convert Decimal to float for JSON serialization
        def decimal_to_float(obj):
            if isinstance(obj, list):
                return [decimal_to_float(i) for i in obj]
            elif isinstance(obj, dict):
                return {k: decimal_to_float(v) for k, v in obj.items()}
            elif isinstance(obj, Decimal):
                return float(obj)
            return obj
        
        items = decimal_to_float(items)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'locations': items,
                'graph': graph_data
            })
        }
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }
