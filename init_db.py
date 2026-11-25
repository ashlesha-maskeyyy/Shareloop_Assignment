"""
Create the database tables and load the demo data.

Vercel runs this once per deployment as the build step (see [tool.vercel.scripts] in
pyproject.toml), so cold starts don't re-run seeding. It is safe to run repeatedly:
existing tables and rows are left alone.

Run it yourself with:  python init_db.py
"""
import os
import sys

if os.environ.get('SKIP_DB_INIT') == '1':
    print('[init_db] SKIP_DB_INIT=1, skipping database setup.')
    sys.exit(0)

from app import app, init_database, raw_db_url  # noqa: E402

engine_name = 'sqlite' if raw_db_url.startswith('sqlite') else 'postgres'
print(f'[init_db] Setting up the {engine_name} database...')
init_database()

from models import User, ResourceItem  # noqa: E402

with app.app_context():
    print(f'[init_db] Done: {User.query.count()} users, {ResourceItem.query.count()} listings.')
