# Cloud Build and Elasticsearch Security Setup Guide

## Cloud Build Trigger Setup

1. Navigate to Cloud Build in Google Cloud Console:
   ```
   https://console.cloud.google.com/cloud-build/triggers
   ```

2. Create a new trigger:
   - Click "Create Trigger"
   - Name: `vision8-backend-deploy`
   - Event: `Push to a branch`
   - Source: Select your GitHub repository
   - Branch: `^main$`
   - Cloud Build configuration file: `/cloudbuild.yaml`

3. Add Secret Variables in Cloud Build:
   ```bash
   # Create secrets in Secret Manager
   gcloud secrets create elastic-api-key --replication-policy="automatic"
   gcloud secrets create gemini-api-key --replication-policy="automatic"
   
   # Store your secrets
   echo "your-elastic-api-key" | gcloud secrets versions add elastic-api-key --data-file=-
   echo "your-gemini-api-key" | gcloud secrets versions add gemini-api-key --data-file=-
   ```

4. Add Secret Variables to Cloud Build Trigger:
   - Click "Show Advanced Options"
   - Under "Substitutions", add:
     ```
     _ELASTIC_URL = https://my-elasticsearch-project-dc9e71.es.us-central1.gcp.elastic-cloud.com:443
     _ELASTIC_API_KEY = ${sm://projects/$PROJECT_ID/secrets/elastic-api-key}
     _GEMINI_API_KEY = ${sm://projects/$PROJECT_ID/secrets/gemini-api-key}
     ```

## Elasticsearch Security Configuration

1. Access Elastic Cloud Console:
   ```
   https://cloud.elastic.co/
   ```

2. Configure Network Security:
   - Go to your deployment → "Security"
   - Under "Network Security", add allowed IP ranges:
     ```
     # Add Cloud Run IP ranges
     35.186.192.0/19
     35.199.0.0/19
     35.235.240.0/20
     ```

3. Create API Key:
   ```
   # In Elastic Cloud Console:
   1. Go to Management → Security → API Keys
   2. Create API key
      Name: vision8-backend
      Role: vision8_backend_role
   3. Copy the generated API key
   ```

4. Create Index Role:
   ```json
   {
     "role_name": "vision8_backend_role",
     "cluster_privileges": ["monitor"],
     "index_privileges": [{
       "names": ["scene_segments"],
       "privileges": [
         "read",
         "write",
         "create_index",
         "view_index_metadata"
       ]
     }]
   }
   ```

5. Configure Index Settings:
   ```json
   PUT /scene_segments
   {
     "settings": {
       "index": {
         "number_of_shards": 1,
         "number_of_replicas": 1,
         "refresh_interval": "1s",
         "mapping": {
           "total_fields": {
             "limit": 1000
           }
         },
         "analysis": {
           "analyzer": {
             "custom_analyzer": {
               "type": "custom",
               "tokenizer": "standard",
               "filter": ["lowercase", "asciifolding"]
             }
           }
         }
       }
     }
   }
   ```

6. Enable Encryption:
   - Enable node-to-node encryption
   - Enable HTTPS for all traffic
   - Enable field-level encryption for sensitive data

## Security Best Practices

1. API Key Rotation:
   - Rotate API keys every 90 days
   - Use different API keys for development and production
   - Monitor API key usage

2. Access Control:
   - Use minimal required permissions
   - Regularly audit access logs
   - Enable IP filtering

3. Data Security:
   - Enable field-level security for sensitive data
   - Regular security updates
   - Monitor unusual patterns

4. Monitoring:
   - Set up alerts for:
     - Failed authentication attempts
     - Unusual traffic patterns
     - High error rates
     - Resource usage spikes

## Maintenance Tasks

1. Regular Backups:
   ```bash
   # Set up daily snapshots
   PUT /_snapshot/vision8_backup
   {
     "type": "gcs",
     "settings": {
       "bucket": "vision8-es-snapshots",
       "compress": true
     }
   }
   ```

2. Index Optimization:
   ```bash
   # Run periodically
   POST /scene_segments/_forcemerge
   ```

3. Health Monitoring:
   ```bash
   # Add to your monitoring system
   GET /_cluster/health
   GET /_nodes/stats
   ```