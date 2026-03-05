from __future__ import annotations

from time import perf_counter

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .model_registry import ModelRegistry
from .schemas import (
    DownloadModelsRequest,
    DownloadModelsResponse,
    EmbeddingsRequest,
    EmbeddingsResponse,
    HealthResponse,
    ModelsResponse,
    ModelStatus,
)

settings = get_settings()
registry = ModelRegistry(settings)

app = FastAPI(
    title='Sentence Transformers Embeddings API',
    version='0.1.0',
    description='Backend for downloading sentence-transformers models and computing embeddings.',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.on_event('startup')
async def preload_models() -> None:
    if not settings.preload_on_startup:
        return

    await run_in_threadpool(registry.download_models, settings.allowed_models, False)


@app.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status='ok')


@app.get('/models', response_model=ModelsResponse)
def list_models() -> ModelsResponse:
    allowed_models = registry.list_allowed_models()
    loaded_models = registry.list_loaded_models()
    statuses = [
        ModelStatus(model_id=model_id, loaded=model_id in loaded_models)
        for model_id in allowed_models
    ]

    return ModelsResponse(
        allowed_models=allowed_models,
        loaded_models=loaded_models,
        statuses=statuses,
    )


@app.post('/models/download', response_model=DownloadModelsResponse)
async def download_models(payload: DownloadModelsRequest) -> DownloadModelsResponse:
    try:
        statuses = await run_in_threadpool(
            registry.download_models,
            payload.model_ids,
            payload.force_reload,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f'Failed to download models: {error}') from error

    return DownloadModelsResponse(downloaded=statuses)


@app.post('/embeddings', response_model=EmbeddingsResponse)
async def compute_embeddings(payload: EmbeddingsRequest) -> EmbeddingsResponse:
    start = perf_counter()

    try:
        embeddings = await run_in_threadpool(
            registry.encode,
            payload.model_id,
            payload.texts,
            payload.normalize_embeddings,
            payload.batch_size,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f'Failed to compute embeddings: {error}') from error

    elapsed_ms = (perf_counter() - start) * 1000
    dimensions = len(embeddings[0]) if embeddings else 0

    return EmbeddingsResponse(
        model_id=payload.model_id,
        count=len(embeddings),
        dimensions=dimensions,
        normalize_embeddings=payload.normalize_embeddings,
        embeddings=embeddings,
        elapsed_ms=elapsed_ms,
    )
