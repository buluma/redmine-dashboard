.PHONY: help up down logs restart shell reset-db

help:
	@echo "NRCC Docker targets:"
	@echo "  make up        - Build and start dashboard in background"
	@echo "  make down      - Stop and remove containers"
	@echo "  make logs      - Tail dashboard logs"
	@echo "  make restart   - Restart dashboard service"
	@echo "  make shell     - Open shell in dashboard container"
	@echo "  make reset-db  - Remove SQLite db and restart service"

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f dashboard

restart:
	docker compose restart dashboard

shell:
	docker compose exec dashboard sh

reset-db:
	rm -f prisma/dev.db
	docker compose up -d
