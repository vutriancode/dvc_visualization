.PHONY: dev-backend dev-frontend install build up down

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

dev-backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down
