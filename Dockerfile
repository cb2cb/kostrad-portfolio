# Receptet som Google Cloud Run använder för att bygga servern.
# Varje rad är ett steg; Google kör dem åt dig när du gör "gcloud run deploy".

# Börja från en liten färdig Linux-miljö med Python 3.12
FROM python:3.12-slim

# All kod läggs i mappen /app inne i servern
WORKDIR /app

# Installera bara de paket servern behöver (inte Streamlit)
COPY requirements-server.txt .
RUN pip install --no-cache-dir -r requirements-server.txt

# Kopiera in koden och de färdiga embeddings (så att de inte behöver skapas om vid varje start)
COPY rag.py api.py embeddings.pkl ./
# Kopiera in mappen med alla PDF:er, inklusive undermapparna (gravida, barn, ammande ...)
COPY kallor/ ./kallor/

# Cloud Run talar om vilken port servern ska lyssna på via variabeln PORT (oftast 8080)
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8080}"]
