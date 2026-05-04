import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
url = os.environ["DATABASE_URL"]

try:
    conn = psycopg2.connect(url)
    print("Verbindung erfolgreich!")
    conn.close()
except Exception as e:
    print(f"Fehler: {e}")
