# Portal.Place Intel — Setup TODO

Staging is live at **https://portalplaceintel.designspore.co**

## 1. Google OAuth Credentials

Required for login to work. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.

- Create an **OAuth 2.0 Client ID** (Web application type)
- Authorized redirect URI: `https://portalplaceintel.designspore.co/api/auth/callback/google`
- Copy the **Client ID** and **Client Secret**
- In Coolify (`http://5.161.236.48:8000`, login: `futurethinkerspodcast@gmail.com` / `KQM!ppC4ks46bFb93&e5Ehqi`):
  - Find `portal-intel` app → Environment Variables
  - Replace `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` placeholder values
  - Hit Redeploy

## 2. Resend API Key

Required for newsletter and email alerts.

- Sign up at [resend.com](https://resend.com)
- Create an API key
- Verify the `portal.place` domain in Resend (they'll give you DNS records to add)
- In Coolify, replace the `RESEND_API_KEY` placeholder value
- Redeploy

## 3. Production DNS

When ready to go live at `intel.portal.place`:

- In Namecheap dashboard, go to `portal.place` → Advanced DNS
- Add **A Record**: Host = `intel`, Value = `5.161.236.48`, TTL = Automatic
- In Coolify, update the app's domain to include `https://intel.portal.place`
- Also update `BASE_URL` and `BETTER_AUTH_URL` env vars to the production domain
- Update Google OAuth redirect URI to include the production domain too

## 4. Namecheap API Whitelist (optional)

The current whitelisted IP (`129.222.139.208`) is stale. If you want Claude to manage DNS via API in the future:

- Namecheap dashboard → Profile → Tools → API Access
- Update the whitelisted IP to your current IP (or the Hetzner server IP `5.161.236.48`)

## 5. Anthropic API Key (for AI Source Search)

Required for the admin AI source search tool.

- Get an API key from [console.anthropic.com](https://console.anthropic.com/)
- In Coolify, add `ANTHROPIC_API_KEY` env var with your key
- Redeploy

## 6. Brave Search API Key (optional, enhances AI Source Search)

Without this, the AI source search will still work using the model's knowledge, but web search results make it much better.

- Sign up at [brave.com/search/api/](https://brave.com/search/api/) (free tier: 2000 queries/month)
- In Coolify, add `BRAVE_SEARCH_API_KEY` env var with your key
- Redeploy

## 7. First Admin User

After Google OAuth is set up:

- Log in with your Google account
- Manually set your role to admin in the database:
  ```sql
  UPDATE user_profiles SET role = 'admin' WHERE user_id = (SELECT id FROM "user" WHERE email = 'mikenoises@gmail.com');
  ```
- You can run this via Coolify's terminal or by exec-ing into the postgres container
