param (
    [string]$UniqueSuffix = (Get-Date -Format "yyyyMMddHHss")
)

$ErrorActionPreference = "Stop"
$AwsRegion = "us-east-1"
$WebsiteBucket = "indoor-nav-website-$UniqueSuffix"
$DataBucket = "indoor-nav-data-$UniqueSuffix"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "INDOOR NAVIGATION - MASTER DEPLOYMENT"
Write-Host "Target Suffix: $UniqueSuffix"
Write-Host "============================================================" -ForegroundColor Cyan

# 0. Get Account Context
$AwsAccountId = (aws sts get-caller-identity --query Account --output text --region $AwsRegion).Trim()
Write-Host "Deploying to Account: $AwsAccountId"

# 1. Setup S3 Buckets
Write-Host "`n[1/7] Creating S3 Buckets..."
aws s3 mb s3://$WebsiteBucket --region $AwsRegion
aws s3 website s3://$WebsiteBucket --index-document index.html --error-document index.html
aws s3 mb s3://$DataBucket --region $AwsRegion

# Configure Website Public Access
aws s3api put-public-access-block --bucket $WebsiteBucket --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
$WebsitePolicyLine = "arn:aws:s3:::$WebsiteBucket/*"
$WebsitePolicy = @"
{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "PublicReadGetObject",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "$WebsitePolicyLine"
    }]
}
"@
$WebsitePolicy | Out-File "tmp_policy.json" -Encoding ASCII
aws s3api put-bucket-policy --bucket $WebsiteBucket --policy file://tmp_policy.json
Remove-Item "tmp_policy.json"

# 2. Setup DynamoDB
Write-Host "`n[2/7] Creating DynamoDB Table (LocationData)..."
aws dynamodb create-table `
    --table-name LocationData `
    --attribute-definitions AttributeName=SearchTerm,AttributeType=S AttributeName=Detail,AttributeType=S `
    --key-schema AttributeName=SearchTerm,KeyType=HASH AttributeName=Detail,KeyType=RANGE `
    --billing-mode PAY_PER_REQUEST `
    --region $AwsRegion | Out-Null
aws dynamodb wait table-exists --table-name LocationData --region $AwsRegion

# 3. Deploy Lambda
Write-Host "`n[3/7] Packaging and Deploying Lambda..."
$ZipFile = "$PSScriptRoot\lambda.zip"
if (Test-Path $ZipFile) { Remove-Item $ZipFile }

$currentDir = Get-Location
Set-Location "..\backend"
Compress-Archive -Path "search_handler.py" -DestinationPath $ZipFile
Set-Location $currentDir

aws lambda create-function `
    --function-name indoor-navigation-search `
    --runtime python3.9 `
    --role arn:aws:iam::${AwsAccountId}:role/LabRole `
    --handler search_handler.lambda_handler `
    --zip-file fileb://$ZipFile `
    --timeout 30 `
    --environment "Variables={DATA_BUCKET=$DataBucket}" `
    --region $AwsRegion | Out-Null
Remove-Item $ZipFile

# 4. Configure API Gateway
Write-Host "`n[4/7] Creating API Gateway and Resources..."
$ApiId = (aws apigateway create-rest-api --name indoor-navigation-api --query 'id' --output text --region $AwsRegion).Trim()
$RootId = (aws apigateway get-resources --rest-api-id $ApiId --query 'items[0].id' --output text --region $AwsRegion).Trim()
$ResId = (aws apigateway create-resource --rest-api-id $ApiId --parent-id $RootId --path-part search --query 'id' --output text --region $AwsRegion).Trim()

foreach ($m in @("GET", "POST", "OPTIONS")) {
    aws apigateway put-method --rest-api-id $ApiId --resource-id $ResId --http-method $m --authorization-type NONE --region $AwsRegion | Out-Null
}

foreach ($m in @("GET", "POST")) {
    aws apigateway put-integration --rest-api-id $ApiId --resource-id $ResId --http-method $m --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:${AwsRegion}:lambda:path/2015-03-31/functions/arn:aws:lambda:${AwsRegion}:${AwsAccountId}:function:indoor-navigation-search/invocations" --region $AwsRegion | Out-Null
}

Write-Host "Configuring CORS (OPTIONS)..."
$MockReq = '{"application/json":"{\"statusCode\": 200}"}'
$MockReq | Out-File "tmp_req.json" -Encoding ASCII
aws apigateway put-integration --rest-api-id $ApiId --resource-id $ResId --http-method OPTIONS --type MOCK --request-templates file://tmp_req.json --region $AwsRegion | Out-Null
aws apigateway put-method-response --rest-api-id $ApiId --resource-id $ResId --http-method OPTIONS --status-code 200 --response-parameters "method.response.header.Access-Control-Allow-Headers=false,method.response.header.Access-Control-Allow-Methods=false,method.response.header.Access-Control-Allow-Origin=false" --region $AwsRegion | Out-Null

$MockRes = @{
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
} | ConvertTo-Json
$MockRes | Out-File "tmp_res.json" -Encoding ASCII
aws apigateway put-integration-response --rest-api-id $ApiId --resource-id $ResId --http-method OPTIONS --status-code 200 --response-parameters file://tmp_res.json --region $AwsRegion | Out-Null
Remove-Item "tmp_req.json", "tmp_res.json"

# 5. Finalize API and Lambda
Write-Host "`n[5/7] Finalizing Permissions and Deployment..."
aws lambda add-permission --function-name indoor-navigation-search --statement-id api-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${AwsRegion}:${AwsAccountId}:${ApiId}/*/*" --region $AwsRegion | Out-Null
aws apigateway create-deployment --rest-api-id $ApiId --stage-name prod --region $AwsRegion | Out-Null

# 6. Seed Database
Write-Host "`n[6/7] Seeding Database (Running seed_db.py)..."
python seed_db.py
aws s3 cp graph.json s3://$DataBucket/graph.json --region $AwsRegion

# 7. Frontend Config and Upload
Write-Host "`n[7/7] Launching Website..."
$ApiUrl = "https://$ApiId.execute-api.$AwsRegion.amazonaws.com/prod/search"
"window.API_SEARCH_ENDPOINT = '$ApiUrl';" | Out-File "..\frontend\env.js" -Encoding ASCII
$FrontendDir = Resolve-Path "..\frontend"
aws s3 sync "$($FrontendDir.Path)" "s3://$WebsiteBucket" --cache-control "max-age=0, no-cache, no-store, must-revalidate"

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "DEPLOYMENT SUCCESSFUL!"
Write-Host "Website URL: http://$WebsiteBucket.s3-website-$AwsRegion.amazonaws.com"
Write-Host "============================================================" -ForegroundColor Green
