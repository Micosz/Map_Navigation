#!/bin/bash

# ==============================================================================
# AWS Learner Lab Infrastructure Setup Script
# ==============================================================================

export AWS_DEFAULT_REGION="us-east-1"
export AWS_REGION="us-east-1"

UNIQUE_SUFFIX=$(date +%s)
WEBSITE_BUCKET="indoor-nav-website-${UNIQUE_SUFFIX}"
DATA_BUCKET="indoor-nav-data-${UNIQUE_SUFFIX}"

echo "Using suffix: $UNIQUE_SUFFIX"
echo "Website Bucket: $WEBSITE_BUCKET"
echo "Data Bucket: $DATA_BUCKET"

# 1. Amazon S3 Setup (2 Buckets)
# ------------------------------

aws s3 mb s3://$WEBSITE_BUCKET --region us-east-1
aws s3 website s3://$WEBSITE_BUCKET --index-document index.html --error-document error.html

# Must turn off block public access before setting policy
aws s3api put-public-access-block \
    --bucket $WEBSITE_BUCKET \
    --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
sleep 2

cat > website-bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$WEBSITE_BUCKET/*"
        }
    ]
}
EOF
aws s3api put-bucket-policy --bucket $WEBSITE_BUCKET --policy file://website-bucket-policy.json
rm website-bucket-policy.json

# Create Data Bucket
aws s3 mb s3://$DATA_BUCKET --region us-east-1

aws s3api put-public-access-block \
    --bucket $DATA_BUCKET \
    --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
sleep 2

cat > cors-config.json << EOF
{
    "CORSRules": [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedOrigins": ["*"],
            "ExposeHeaders": []
        }
    ]
}
EOF
aws s3api put-bucket-cors --bucket $DATA_BUCKET --cors-configuration file://cors-config.json
rm cors-config.json

cat > data-bucket-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$DATA_BUCKET/*"
        }
    ]
}
EOF
aws s3api put-bucket-policy --bucket $DATA_BUCKET --policy file://data-bucket-policy.json
rm data-bucket-policy.json

# 2. Amazon DynamoDB Table
# ------------------------
echo "Creating DynamoDB Table... (ignoring if exists)"
aws dynamodb create-table \
    --table-name LocationData \
    --attribute-definitions \
        AttributeName=SearchTerm,AttributeType=S \
        AttributeName=Detail,AttributeType=S \
    --key-schema \
        AttributeName=SearchTerm,KeyType=HASH \
        AttributeName=Detail,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --region us-east-1 || true

aws dynamodb wait table-exists --table-name LocationData

# 3. AWS Lambda Function deployment
# ---------------------------------
cd ../backend

powershell -Command "Compress-Archive -Path search_handler.py -DestinationPath lambda-function.zip -Force"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Deploying/Updating Lambda..."
aws lambda create-function \
    --function-name indoor-navigation-search \
    --runtime python3.9 \
    --role arn:aws:iam::$AWS_ACCOUNT_ID:role/LabRole \
    --handler search_handler.lambda_handler \
    --zip-file fileb://lambda-function.zip \
    --timeout 30 \
    --environment Variables="{DATA_BUCKET=$DATA_BUCKET}" \
    --region us-east-1 || \
aws lambda update-function-code \
    --function-name indoor-navigation-search \
    --zip-file fileb://lambda-function.zip

rm lambda-function.zip
cd ../infrastructure

# 4. Amazon API Gateway
# ---------------------
API_ID=$(aws apigateway create-rest-api \
    --name indoor-navigation-api \
    --description "API for Indoor Navigation System" \
    --query 'id' --output text --region us-east-1) || exit 1

echo "API ID: $API_ID"

ROOT_RESOURCE_ID=$(aws apigateway get-resources \
    --rest-api-id $API_ID \
    --query 'items[0].id' --output text --region us-east-1)

SEARCH_RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ROOT_RESOURCE_ID \
    --path-part search \
    --query 'id' --output text --region us-east-1)

# Options Method
aws apigateway put-method --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method OPTIONS --authorization-type NONE
aws apigateway put-method-response --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters method.response.header.Access-Control-Allow-Headers=false,method.response.header.Access-Control-Allow-Methods=false,method.response.header.Access-Control-Allow-Origin=false
aws apigateway put-integration --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method OPTIONS --type MOCK --request-templates '{"application/json": "{\"statusCode\": 200}"}'
aws apigateway put-integration-response --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method OPTIONS --status-code 200 --response-parameters '{"method.response.header.Access-Control-Allow-Headers": "'\''Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'\''", "method.response.header.Access-Control-Allow-Methods": "'\''GET,POST,OPTIONS'\''", "method.response.header.Access-Control-Allow-Origin": "'\''*'\''"}'

# GET and POST Methods
aws apigateway put-method --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method GET --authorization-type NONE
aws apigateway put-method --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method POST --authorization-type NONE

# Integrations
aws apigateway put-integration --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method GET --type AWS_PROXY --integration-http-method POST --uri arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:$AWS_ACCOUNT_ID:function:indoor-navigation-search/invocations
aws apigateway put-integration --rest-api-id $API_ID --resource-id $SEARCH_RESOURCE_ID --http-method POST --type AWS_PROXY --integration-http-method POST --uri arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:$AWS_ACCOUNT_ID:function:indoor-navigation-search/invocations

# Grant permission
aws lambda add-permission --function-name indoor-navigation-search --statement-id api-gateway-invoke-$API_ID --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-east-1:$AWS_ACCOUNT_ID:$API_ID/*/*" || true

# Deploy logic
aws apigateway create-deployment --rest-api-id $API_ID --stage-name prod
echo "API Endpoint: https://$API_ID.execute-api.us-east-1.amazonaws.com/prod/search"

# 5. Populate Sample Data
# -----------------------
aws dynamodb put-item \
    --table-name LocationData \
    --item '{
        "SearchTerm": {"S": "LC3-101"},
        "Detail": {"S": "ROOM"},
        "RoomNumber": {"S": "101"},
        "RoomName": {"S": "Computer Lab 1"},
        "NodeID": {"S": "node_101"},
        "Floor": {"N": "1"}
    }' --region us-east-1

aws dynamodb put-item \
    --table-name LocationData \
    --item '{
        "SearchTerm": {"S": "LC3-201"},
        "Detail": {"S": "ROOM"},
        "RoomNumber": {"S": "201"},
        "RoomName": {"S": "Office 201"},
        "NodeID": {"S": "node_201"},
        "Floor": {"N": "2"}
    }' --region us-east-1

echo "Uploading graph structure to S3 bucket $DATA_BUCKET"
aws s3 cp graph.json s3://$DATA_BUCKET/graph.json --region us-east-1

# Also let's overwrite the frontend URL for testing seamlessly
echo "window.API_SEARCH_ENDPOINT = 'https://$API_ID.execute-api.us-east-1.amazonaws.com/prod/search';" > ../frontend/env.js

echo "==================================="
echo "Setup Complete!"
echo "Website URL: http://$WEBSITE_BUCKET.s3-website-us-east-1.amazonaws.com"
echo "API URL has been written to frontend/env.js automatically."
