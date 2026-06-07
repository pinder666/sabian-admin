# Google Earth Engine Setup for Fire Data

## Service Account Creation

1. **Go to Google Cloud Console**: https://console.cloud.google.com/

2. **Create or Select Project**:
   - Create new project: "sabian-earth-engine" (or any name)
   - Note the Project ID (you'll need this)

3. **Enable Earth Engine API**:
   - Go to APIs & Services > Library
   - Search for "Earth Engine API"
   - Click "Enable"

4. **Create Service Account**:
   - Go to IAM & Admin > Service Accounts
   - Click "Create Service Account"
   - Name: `sabian-gee-fetcher`
   - Description: "Sabian historical fire data fetcher"
   - Click "Create and Continue"
   - Role: "Service Account User" (basic role)
   - Click "Done"

5. **Generate Key**:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" > "Create New Key"
   - Choose JSON format
   - Click "Create"
   - **Save the JSON file to:** `C:\Users\user\Desktop\sabian.ai\sabian_core\gee-service-account.json`

6. **Register Service Account with Earth Engine**:
   - Go to https://code.earthengine.google.com/
   - Sign in with your Google account
   - Click on your profile icon > "Register a new Cloud Project"
   - Select the project you created
   - Register service account email (format: `sabian-gee-fetcher@PROJECT_ID.iam.gserviceaccount.com`)

7. **Add to .env**:
   ```
   GEE_SERVICE_ACCOUNT_KEY=C:\Users\user\Desktop\sabian.ai\sabian_core\gee-service-account.json
   GEE_PROJECT_ID=your-project-id-here
   ```

## Verification

After setup, run:
```bash
node historical/fetchers/gee_fire_test.cjs
```

This should authenticate and fetch a test sample of fire data.

## Cost

- Earth Engine is FREE for noncommercial research and education
- No credit card required
- 5000 requests per day quota (plenty for our backfill)

## Troubleshooting

**"Service account not registered"**:
- Make sure you registered the service account email at code.earthengine.google.com

**"Earth Engine API not enabled"**:
- Go to APIs & Services > Library and enable it

**"Invalid credentials"**:
- Check that the JSON file path in .env is correct
- Verify the service account email matches exactly
