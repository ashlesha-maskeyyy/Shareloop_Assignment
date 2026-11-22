# Deploying ShareLoop on Vercel

ShareLoop runs on Vercel as one Python function (Flask) plus static files on Vercel's CDN.

| Piece | What it uses on Vercel | Locally |
| --- | --- | --- |
| Backend | `app.py` (Flask), detected automatically | `python app.py` |
| Database | Neon Postgres (`DATABASE_URL`) | SQLite file `shareloop.db` |
| Photo uploads | Vercel Blob, public store (`BLOB_READ_WRITE_TOKEN`) | `public/static/uploads/` |
| CSS, JS, fonts, images | `public/static/` served by the CDN at `/static/...` | served by Flask |
| Tables and demo data | `init_db.py`, run in the build step of every deployment | run when the app starts |

## 1. Put the code on GitHub

Push this folder to your GitHub repository (for example `welcomeshrestha/Shareloop_Assignment`).
Never commit a `.env` file; `.gitignore` already excludes it.

## 2. Import the project

1. Go to https://vercel.com/new and import the repository.
2. Framework preset: **Flask** (detected automatically). Leave the build and output settings empty.
3. Before clicking **Deploy**, open **Environment Variables** and add:
   - `SECRET_KEY`: a long random value. Generate one with
     `python -c "import secrets; print(secrets.token_hex(32))"`.
4. Click **Deploy**. This first build fails with "DATABASE_URL is not set". That is expected; the next step adds the database.

## 3. Add the database (Neon Postgres)

1. In the project, open the **Storage** tab, then **Create Database**, then **Neon**.
2. Choose the **Singapore (aws-ap-southeast-1)** region. The app's functions run in Singapore (`sin1`, set in `vercel.json`), which is the closest region to Nepal. If you choose another database region, change `regions` in `vercel.json` to match (for US East use `iad1`).
3. Connect it to all environments (Production, Preview, Development). Vercel adds `DATABASE_URL` and related variables automatically.

## 4. Add photo storage (Vercel Blob)

1. In the **Storage** tab, click **Create Database**, then **Blob**.
2. Set access to **Public**, because listing photos are shown to every signed-in user.
3. Connect it to the project. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.

## 5. Redeploy

Go to **Deployments**, open the menu on the latest deployment, and choose **Redeploy**.
The build log should end with lines like:

```
[init_db] Setting up the postgres database...
[init_db] Done: 9 users, 7 listings.
```

Then open `https://<your-project>.vercel.app/healthz`. It should show:

```json
{"ok": true, "database": "postgres", "photo_storage": "vercel-blob"}
```

## 6. Demo accounts

The build creates these accounts, all with the password `password123`:

- Student: `rajesh.kc@gmail.com`
- Organization: `org@shareloop.edu`
- Admin: `admin@shareloop.edu`

Change these passwords, or delete the accounts, before you share the site publicly.

## Optional: password-reset emails

Add `MAIL_USERNAME` (your Gmail address) and `MAIL_PASSWORD` (a Gmail **App Password**, not your normal password), then redeploy. Without them, reset links are only printed in the function logs.

## Running locally

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                    # http://127.0.0.1:5001, SQLite + local uploads
```

To use the Vercel database locally instead, copy `.env.example` to `.env` and paste the `DATABASE_URL` from Vercel. You can also run `vercel env pull .env` with the Vercel CLI.

## Limits to know

- Each upload request can be at most 4.5 MB on Vercel. The browser resizes photos to 1600px JPEGs before uploading, so a normal phone photo shrinks to roughly 0.3 to 0.7 MB.
- Nothing written to the function's disk is kept. That is why the database and photos live in Neon and Blob.
- Demo data is only added when it is missing, so redeploying never duplicates or overwrites real data. To skip that step, set `SKIP_DB_INIT=1`.
