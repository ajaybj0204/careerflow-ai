# Google Cloud setup (Gmail, Pub/Sub, Gemini)

## Gmail OAuth client
1. https://console.cloud.google.com → create project "careerflow".
2. APIs & Services → Library → enable **Gmail API**.
3. OAuth consent screen → External → app name, support email, developer email.
   - Scopes: `openid`, `.../auth/userinfo.email`, `https://www.googleapis.com/auth/gmail.readonly`.
   - **Test users**: add the Gmail addresses that will use the app. While in testing, only these accounts can connect.
4. Credentials → Create credentials → OAuth client ID → Web application.
   - Authorised redirect URIs: `http://localhost:3100/api/gmail/callback` and `https://<domain>/api/gmail/callback`.
5. Put the client ID/secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and generate `TOKEN_ENCRYPTION_KEY`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Restricted scope notice: `gmail.readonly` needs Google's OAuth verification and a CASA security assessment before
the app can be used by people outside the test-user list.

## Gmail push notifications (optional, recommended)
1. Enable **Cloud Pub/Sub API**. Create topic `gmail-careerflow`.
2. Topic → Permissions → add principal `gmail-api-push@system.gserviceaccount.com` with role **Pub/Sub Publisher**.
3. Create a service account (e.g. `careerflow-push@…`) for authenticated push.
4. Create a **push** subscription on the topic:
   - Endpoint: `https://<domain>/api/gmail/push`
   - Enable authentication → service account from step 3 → Audience: `https://<domain>/api/gmail/push`
5. Env: `GMAIL_PUBSUB_TOPIC=projects/<project-id>/topics/gmail-careerflow`, `PUBSUB_PUSH_AUDIENCE=https://<domain>/api/gmail/push`,
   `PUBSUB_SERVICE_ACCOUNT_EMAIL=<service account email>`.
Watches expire after 7 days; the scheduler renews them automatically. Polling remains as a fallback.

## Gemini API key
1. https://aistudio.google.com/apikey → Create API key (restrict it to the Generative Language API).
2. `GEMINI_API_KEY=...`, optional `GEMINI_MODEL` (default `gemini-3.6-flash`) and `GEMINI_FALLBACK_MODELS` (tried in order when a model is busy or retired).
The provider sits behind `packages/ai` so another provider can be added without touching feature code.
