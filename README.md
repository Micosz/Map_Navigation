# Indoor Map Navigation System

A serverless indoor navigation system designed for high-performance pathfinding and location search. This project leverages AWS serverless architecture including S3 for hosting, Lambda for compute, DynamoDB for metadata storage, and API Gateway for the backend interface.

## 🚀 Overview

- **Frontend**: A modern, interactive map interface with glassmorphism design.
- **Backend**: Python-based Lambda functions handling search and routing logic.
- **Data**: Topological graph stored in S3 and searchable location metadata in DynamoDB.
- **Infrastructure**: Automated "one-click" deployment scripts for Windows and macOS.

## 📋 Prerequisites

Before setting up the project, ensure you have the following installed and configured:

1.  **AWS CLI**: [Installed](https://aws.amazon.com/cli/) and configured (`aws configure`) with valid credentials.
2.  **Python 3.9+**: To run the database seeding scripts.
3.  **Boto3**: Python library for AWS interaction.
    ```bash
    pip install boto3
    ```
4.  **Zip Utility**: (Required for macOS/Linux) to package Lambda functions.

## 🛠️ Installation & Setup

Choose the setup instructions based on your operating system.

### Windows (PowerShell)

1.  Open PowerShell as an Administrator.
2.  Navigate to the `infrastructure` directory:
    ```powershell
    cd infrastructure
    ```
3.  Run the master deployment script:
    ```powershell
    .\aws_setup.ps1
    ```
    *Note: If you encounter an execution policy error, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process` first.*

### macOS / Linux (Bash)

1.  Open your terminal.
2.  Navigate to the `infrastructure` directory:
    ```bash
    cd infrastructure
    ```
3.  Make the script executable:
    ```bash
    chmod +x aws_setup.sh
    ```
4.  Run the master deployment script:
    ```bash
    ./aws_setup.sh
    ```

## 📂 Project Structure

-   `frontend/`: Static web assets (HTML, CSS, JS).
-   `backend/`: Lambda function source code (`search_handler.py`).
-   `infrastructure/`: AWS setup scripts, database seeding scripts, and the topological graph (`graph.json`).

## 🌐 Verifying Deployment

Upon successful completion of the setup script:
1.  The script will output a **Website URL** (hosted on S3).
2.  Open the URL in any modern web browser.
3.  The frontend will automatically connect to your newly deployed API Gateway.
4.  You can start searching for room numbers or events (e.g., "101", "Hackathon") to see the navigation in action.

## ⚠️ Important Notes

-   The setup scripts are designed to work in standard AWS environments. If you are using **AWS Academy / Lab** environments, the scripts expect a role named `LabRole`.
-   The default region is set to `us-east-1`. To change this, modify the `AwsRegion` or `AWS_REGION` variable at the top of the setup scripts.
