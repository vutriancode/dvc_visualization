FROM python:3.12-slim

WORKDIR /app

# Install rclone + iptables (for OAuth loopback bridge)
RUN apt-get update && apt-get install -y curl unzip iptables && \
    curl https://rclone.org/install.sh | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

RUN mkdir -p /app/data

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
