# Embeddings Tool

Comparador visual de modelos `sentence-transformers` con:
- Frontend: Vue 3 + Vite
- Backend: FastAPI + sentence-transformers
- Permite escribir un `model_id` y descargarlo desde la UI

## Modelos por defecto

Incluye un catalogo ampliado de modelos generales, multilingues y retrieval:
- `all-MiniLM-L6-v2`, `all-mpnet-base-v2`, `all-distilroberta-v1`
- `paraphrase-multilingual-MiniLM-L12-v2`, `paraphrase-multilingual-mpnet-base-v2`
- `distiluse-base-multilingual-cased-v2`, `LaBSE`
- `multi-qa-mpnet-base-dot-v1`, `multi-qa-MiniLM-L6-cos-v1`
- `msmarco-distilbert-base-v4`, `msmarco-MiniLM-L6-cos-v5`

## Estructura

- `src/`: frontend Vue
- `backend/`: API FastAPI para descarga/carga de modelos y embeddings

## 1) Levantar backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 2) Levantar frontend

En otra terminal:

```bash
npm install
npm run dev
```

Opcionalmente, define la URL base del backend en un `.env` del frontend:

```bash
VITE_EMBEDDINGS_API_BASE_URL=http://localhost:8000
```

## Desarrollo con Docker

Requisitos:
- Docker Engine + Docker Compose plugin.

Levantar frontend y backend en modo desarrollo (con hot reload):

```bash
docker compose up --build
```

Servicios:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

Detalles del setup:
- El codigo fuente de frontend y backend se monta como volumen para recarga en caliente.
- `frontend_node_modules` se guarda en un volumen nombrado.
- `backend_models_cache` persiste la cache de modelos descargados.
- El backend corre en CPU (`ST_DEVICE=cpu`) para desarrollo.
- El frontend usa `/api` con proxy de Vite hacia el backend para evitar errores de red en el navegador.

Comandos utiles:

```bash
docker compose up -d
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

## Backend API

- `GET /health`
- `GET /models`
- `POST /models/download`
- `POST /embeddings`

Ver ejemplos en `backend/README.md`.

## Frontend build/lint

```bash
npm run lint
npm run build
```
