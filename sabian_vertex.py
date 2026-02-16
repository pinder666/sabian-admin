from google.oauth2 import service_account
from google.cloud import aiplatform

# Authenticate using your service account
credentials = service_account.Credentials.from_service_account_file(
    "sabian-vertex-access.json"
)

# Initialize Vertex AI
aiplatform.init(
    project="sabian-knowledge-core",
    location="us-central1",
    credentials=credentials
)

# Example call: list models
models = aiplatform.Model.list()
print("✅ Connected to Vertex AI")
print("📦 Models:", models)
