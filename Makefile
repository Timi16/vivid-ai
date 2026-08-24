COMPOSE ?= docker compose
# usage: make logs s=backend   (s = one service; empty = all)
s ?=

.DEFAULT_GOAL := help

.PHONY: help up build down stop restart ps logs backend frontend worker \
	shell db redis health models smoke search-eval clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Start the full stack (detached)
	$(COMPOSE) up -d

build: ## Rebuild images and start the stack
	$(COMPOSE) up -d --build

down: ## Stop and remove containers (data volumes kept)
	$(COMPOSE) down

stop: ## Stop containers without removing them
	$(COMPOSE) stop

restart: ## Restart everything, or one service: make restart s=backend
	$(COMPOSE) restart $(s)

ps: ## Show container status
	$(COMPOSE) ps

logs: ## Follow logs, or one service: make logs s=backend
	$(COMPOSE) logs -f --tail=100 $(s)

backend: ## Rebuild + restart backend and worker only
	$(COMPOSE) up -d --build backend worker

frontend: ## Rebuild + restart frontend only
	$(COMPOSE) up -d --build frontend

worker: ## Follow worker logs
	$(COMPOSE) logs -f --tail=100 worker

shell: ## Shell inside the backend container
	$(COMPOSE) exec backend bash

db: ## psql into Postgres
	$(COMPOSE) exec postgres psql -U vivid vivid

redis: ## redis-cli into Redis
	$(COMPOSE) exec redis redis-cli

health: ## Backend health check
	@curl -s http://localhost:8000/v1/health | python3 -m json.tool

models: ## Model services (RunPod) health check
	@curl -s http://localhost:8000/v1/health/models | python3 -m json.tool

smoke: ## End-to-end API smoke test (needs the stack up)
	$(COMPOSE) exec -T backend python -m app.scripts.smoke_test

search-eval: ## Raw vs rewritten web search on transcripts: make search-eval f=transcripts.txt
	$(COMPOSE) exec -T backend python -m app.scripts.search_eval $(if $(f),--file /dev/stdin,) < $(if $(f),$(f),/dev/null)

clean: ## DESTROYS DATA: remove containers AND volumes (Postgres, MinIO)
	$(COMPOSE) down -v
