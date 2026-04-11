#!/bin/bash

# ============================================================
# Indoor Navigation MASTER Setup Script (Mac/Linux version)
# ============================================================

UNIQUE_SUFFIX=$(date +%Y%m%d%H%S)
AWS_REGION="us-east-1"
WEBSITE_BUCKET="indoor-nav-website-${UNIQUE_SUFFIX}"
DATA_BUCKET="indoor-nav-data-${UNIQUE_SUFFIX}"

echo "============================================================"
echo "Indoor Navigation MASTER Setup Script"
echo "Suffix: $UNIQUE_SUFFIX"
echo "============================================================"

# 0. Get Account Context
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region $AWS_REGION)

# 1. Setup S3 Buckets
echo -e "\n[1/7] Creating S3 Buckets..."
aws s3 mb s3://$WEBSITE_BUCKET --region $AWS_REGION
aws s3 website s3://$WEBSITE_BUCKET --index-document index.html --error-document index.html
aws s3 mb s3://$DATA_BUCKET --region $AWS_REGION

# Configure Website Public Access
aws s3api put-public-access-block --bucket $WEBSITE_BUCKET --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
cat > tmp_policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "PublicReadGetObject",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::$WEBSITE_BUCKET/*"
    }]
}
EOF
aws s3api put-bucket-policy --bucket $WEBSITE_BUCKET --policy file://tmp_policy.json
rm tmp_policy.json

# 2. Setup DynamoDB
echo -e "\n[2/7] Creating DynamoDB Table..."
aws dynamodb create-table \
    --table-name LocationData \
    --attribute-definitions AttributeName=SearchTerm,AttributeType=S AttributeName=Detail,AttributeType=S \
    --key-schema AttributeName=SearchTerm,KeyType=HASH AttributeName=Detail,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --region $AWS_REGION || echo "Table already exists, skipping..."

aws dynamodb wait table-exists --table-name LocationData --region $AWS_REGION

# 3. Deploy Lambda
echo -e "\n[3/7] Deploying Lambda Function..."
cd ../backend
zip lambda.zip search_handler.py

aws lambda create-function \
    --function-name indoor-navigation-search \
    --runtime python3.9 \
    --role arn:aws:iam::${AWS_ACCOUNT_ID}:role/LabRole \
    --handler search_handler.lambda_handler \
    --zip-file fileb://lambda.zip \
    --timeout 30 \
    --environment "Variables={DATA_BUCKET=$DATA_BUCKET}" \
    --region $AWS_REGION || \
(echo "Updating existing function..." && \
 aws lambda update-function-code --function-name indoor-navigation-search --zip-file fileb://lambda.zip --region $AWS_REGION && \
 aws lambda update-function-configuration --function-name indoor-navigation-search --environment "Variables={DATA_BUCKET=$DATA_BUCKET}" --region $AWS_REGION)

rm lambda.zip
cd ../infrastructure

# 4. Configure API Gateway
echo -e "\n[4/7] Creating API Gateway..."
API_ID=$(aws apigateway create-rest-api --name indoor-navigation-api --query 'id' --output text --region $AWS_REGION)
ROOT_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query 'items[0].id' --output text --region $AWS_REGION)
RES_ID=$(aws apigateway create-resource --rest-api-id $API_ID --parent-id $ROOT_ID --path-part search --query 'id' --output text --region $AWS_REGION)

for method in GET POST OPTIONS; do
    aws apigateway put-method --rest-api-id $API_ID --resource-id $RES_ID --http-method $method --authorization-type NONE --region $AWS_REGION
done

for method in GET POST; do
    aws apigateway put-integration --rest-api-id $API_ID --resource-id $RES_ID --http-method $method --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:indoor-navigation-search/invocations" --region $AWS_REGION
done

echo "Configuring CORS (OPTIONS)..."
echo '{"application/json":"{\"statusCode\": 200}"}' > tmp_req.json
aws apigateway put-integration --rest-api-id $API_ID --resource-id $RES_ID --http-method OPTIONS --type MOCK --request-templates file://tmp_req.json --region $AWS_REGION

aws apigateway put-method-response --rest-api-id $API_ID --resource-id $RES_ID --http-method OPTIONS --status-code 200 \
    --response-parameters "method.response.header.Access-Control-Allow-Headers=false,method.response.header.Access-Control-Allow-Methods=false,method.response.header.Access-Control-Allow-Origin=false" --region $AWS_REGION

cat > tmp_res.json << EOF
{
    "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods": "'GET,POST,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin": "'*'"
}
EOF
aws apigateway put-integration-response --rest-api-id $API_ID --resource-id $RES_ID --http-method OPTIONS --status-code 200 --response-parameters file://tmp_res.json --region $AWS_REGION
rm tmp_req.json tmp_res.json

# 5. Finalize API and Lambda
echo -e "\n[5/7] Finalizing Permissions and Deployment..."
aws lambda add-permission --function-name indoor-navigation-search --statement-id api-invoke-${UNIQUE_SUFFIX} --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${AWS_REGION}:${AWS_ACCOUNT_ID}:${API_ID}/*/*" --region $AWS_REGION
aws apigateway create-deployment --rest-api-id $API_ID --stage-name prod --region $AWS_REGION

# 6. Seed Database
echo -e "\n[6/7] Seeding Database (Running seed_db.py)..."
python3 seed_db.py
aws s3 cp graph.json s3://$DATA_BUCKET/graph.json --region $AWS_REGION

# 7. Frontend Config and Upload
echo -e "\n[7/7] Launching Frontend..."
API_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/prod/search"
echo "window.API_SEARCH_ENDPOINT = '${API_URL}';" > ../frontend/env.js
aws s3 sync ../frontend s3://$WEBSITE_BUCKET --cache-control "max-age=0, no-cache, no-store, must-revalidate"

echo -e "\n============================================================"
echo "SETUP COMPLETE!"
echo "Website URL: http://$WEBSITE_BUCKET.s3-website-$AWS_REGION.amazonaws.com"
echo "============================================================"
