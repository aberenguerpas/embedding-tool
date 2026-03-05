# Backend (FastAPI + sentence-transformers)

API para descargar/cargar modelos de `sentence-transformers` y calcular embeddings por lote.

## 1) Instalar dependencias

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) Configuracion

```bash
cp .env.example .env
```

Variables importantes:
- `ST_ALLOWED_MODELS`: lista de modelos permitidos.
- `ST_ALLOW_DYNAMIC_MODELS=true`: permite descargar modelos escritos manualmente desde la UI.
- `ST_PRELOAD_ON_STARTUP=true`: precarga modelos al arrancar.
- `ST_DEVICE=cpu` o `cuda`.

## 3) Ejecutar

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints

- `GET /health`
- `GET /models`
- `POST /models/download`
- `POST /embeddings`

### Ejemplo: descargar modelos

```bash
curl -X POST http://localhost:8000/models/download \
  -H 'Content-Type: application/json' \
  -d '{"model_ids":["sentence-transformers/all-MiniLM-L6-v2"]}'
```

### Ejemplo: embeddings

```bash
curl -X POST http://localhost:8000/embeddings \
  -H 'Content-Type: application/json' \
  -d '{
    "model_id":"sentence-transformers/all-MiniLM-L6-v2",
    "texts":["hola mundo","embeddings en fastapi"],
    "normalize_embeddings":true
  }'
```
