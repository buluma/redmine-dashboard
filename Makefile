.PHONY: help up down logs restart shell health status backup clean migrate migrate-rollback db-status import-supabase

help:
	@echo "NRCC Docker targets:"
	@echo "  make up             - Build and start dashboard + Postgres in background"
	@echo "  make down           - Stop and remove containers"
	@echo "  make logs           - Tail dashboard + postgres logs"
	@echo "  make restart        - Restart dashboard service"
	@echo "  make shell          - Open shell in dashboard container"
	@echo "  make import-supabase - Import Supabase DB into local Docker Postgres (set SUPABASE_DATABASE_URL)"
	@echo "  make health         - Check container health status"
	@echo "  make status         - Show container status and health"
	@echo "  make backup         - pg_dump the Postgres database"
	@echo "  make clean          - Remove build artifacts and caches"
	@echo ""
	@echo "Database Migration targets:"
	@echo "  make migrate        - Apply pending migrations"
	@echo "  make migrate-rollback - Rollback last migration (use with caution!)"
	@echo "  make db-status      - Show migration status"

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f dashboard postgres

restart:
	docker compose restart dashboard

shell:
	docker compose exec dashboard sh

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
	@docker inspect --format='{{.State.Health.Status}}' redmine-dashboard 2>/dev/null || echo "Container not running"
	@echo ""
	@echo "=== Recent Health Checks ==="
	@docker inspect --format='{{range .State.Health.Log}}Message: {{.Output}}\n{{end}}' redmine-dashboard 2>/dev/null | head -20 || echo "No health data"

backup:
	@mkdir -p backups
	@echo "Creating backup..."
	@docker compose exec -T postgres pg_dump -U $${DOCKER_POSTGRES_USER:-postgres} -d $${DOCKER_POSTGRES_DB:-redmine_dashboard} -F c > backups/postgres.$$(date +%Y%m%d_%H%M%S).dump
	@echo "Backup complete. Files:"
	@ls -la backups/

# Database migrations
migrate:
	@echo "Applying database migrations..."
	@bunx prisma migrate deploy
	@echo "Migrations applied successfully"

migrate-rollback:
	@echo "⚠️  Rolling back last migration..."
	@read -p "Are you sure? This may cause data loss. Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	@echo "Rolling back..."
	@bunx prisma migrate rollback
	@echo "Migration rolled back"

db-status:
	@echo "=== Migration Status ==="
	@bunx prisma migrate status

clean:
	echo "Cleaning build artifacts..."
	rm -rf .next
	rm -rf node_modules/.cache
	find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.log" -delete 2>/dev/null || true
	@echo "Clean complete."
