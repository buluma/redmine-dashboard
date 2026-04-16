.PHONY: help up down logs restart shell reset-db health status backup clean migrate migrate-rollback db-status up-pg down-pg logs-pg import-supabase

help:
	@echo "NRCC Docker targets:"
	@echo "  make up             - Build and start dashboard in background"
	@echo "  make up-pg          - Build and start dashboard + local Postgres in background"
	@echo "  make down           - Stop and remove containers"
	@echo "  make down-pg        - Stop and remove Postgres-mode containers"
	@echo "  make logs           - Tail dashboard logs"
	@echo "  make logs-pg        - Tail dashboard + postgres logs (Postgres mode)"
	@echo "  make restart        - Restart dashboard service"
	@echo "  make shell          - Open shell in dashboard container"
	@echo "  make reset-db       - Remove SQLite db and restart service"
	@echo "  make import-supabase - Import Supabase DB into local Docker Postgres (set SUPABASE_DATABASE_URL)"
	@echo "  make health         - Check container health status"
	@echo "  make status         - Show container status and health"
	@echo "  make backup         - Backup the database"
	@echo "  make clean          - Remove build artifacts and caches"
	@echo ""
	@echo "Database Migration targets:"
	@echo "  make migrate        - Apply pending migrations"
	@echo "  make migrate-rollback - Rollback last migration (use with caution!)"
	@echo "  make db-status      - Show migration status"

up:
	docker compose up --build -d

up-pg:
	docker compose -f docker-compose.postgres.yml up --build -d

down:
	docker compose down

down-pg:
	docker compose -f docker-compose.postgres.yml down

logs:
	docker compose logs -f dashboard

logs-pg:
	docker compose -f docker-compose.postgres.yml logs -f dashboard postgres

restart:
	docker compose restart dashboard

shell:
	docker compose exec dashboard sh

reset-db:
	rm -f prisma/dev.db
	docker compose up -d

import-supabase:
	@if [ -z "$$SUPABASE_DATABASE_URL" ]; then \
		echo "SUPABASE_DATABASE_URL is required"; \
		echo "Example: make import-supabase SUPABASE_DATABASE_URL='postgresql://...'"; \
		exit 1; \
	fi
	./scripts/import-supabase-to-docker-postgres.sh "$$SUPABASE_DATABASE_URL"

health:
	@echo "Container health check:"
	@docker compose ps --format "{{.Name}}: {{.Health}}"
	@echo ""
	@echo "API health endpoint:"
	@curl -sf http://localhost:3000/api/health || echo "API not responding"

status:
	@echo "=== Container Status ==="
	@docker compose ps
	@echo ""
	@echo "=== Health Status ==="
	@docker inspect --format='{{.State.Health.Status}}' redmine-dashboard-dashboard-1 2>/dev/null || echo "Container not running"
	@echo ""
	@echo "=== Recent Health Checks ==="
	@docker inspect --format='{{range .State.Health.Log}}Message: {{.Output}}\n{{end}}' redmine-dashboard-dashboard-1 2>/dev/null | head -20 || echo "No health data"

backup:
	@mkdir -p backups
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S)
	@echo "Creating backup..."
	@docker compose exec dashboard sh -c 'test -f prisma/dev.db && cp prisma/dev.db /app/backups/dev.db.$$TIMESTAMP || echo "No database file found"'
	@if [ -f prisma/dev.db ]; then cp prisma/dev.db backups/dev.db.$(date +%Y%m%d_%H%M%S); fi
	@echo "Backup complete. Files:"
	@ls -la backups/

# Database migrations
migrate:
	@echo "Applying database migrations..."
	@npx prisma migrate deploy
	@echo "Migrations applied successfully"

migrate-rollback:
	@echo "⚠️  Rolling back last migration..."
	@read -p "Are you sure? This may cause data loss. Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	@echo "Rolling back..."
	@npx prisma migrate rollback
	@echo "Migration rolled back"

db-status:
	@echo "=== Migration Status ==="
	@npx prisma migrate status

clean:
	echo "Cleaning build artifacts..."
	rm -rf .next
	rm -rf node_modules/.cache
	find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.log" -delete 2>/dev/null || true
	@echo "Clean complete."
