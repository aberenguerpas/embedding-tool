import os
from dataclasses import dataclass

DEFAULT_MODELS = [
    'sentence-transformers/all-MiniLM-L6-v2',
    'sentence-transformers/all-mpnet-base-v2',
    'sentence-transformers/all-distilroberta-v1',
    'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    'sentence-transformers/paraphrase-multilingual-mpnet-base-v2',
    'sentence-transformers/distiluse-base-multilingual-cased-v2',
    'sentence-transformers/LaBSE',
    'sentence-transformers/multi-qa-mpnet-base-dot-v1',
    'sentence-transformers/multi-qa-MiniLM-L6-cos-v1',
    'sentence-transformers/msmarco-distilbert-base-v4',
    'sentence-transformers/msmarco-MiniLM-L6-cos-v5',
]


def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {'1', 'true', 'yes', 'on'}:
        return True
    if normalized in {'0', 'false', 'no', 'off'}:
        return False
    return default


def parse_csv(value: str | None, default: list[str]) -> list[str]:
    if value is None:
        return default

    items = [item.strip() for item in value.split(',') if item.strip()]
    if not items:
        return default
    return items


def parse_int(value: str | None, default: int) -> int:
    if value is None:
        return default

    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    allowed_models: list[str]
    allow_dynamic_models: bool
    preload_on_startup: bool
    device: str
    cache_dir: str | None
    batch_size: int
    cors_allow_origins: list[str]


def get_settings() -> Settings:
    return Settings(
        host=os.getenv('BACKEND_HOST', '0.0.0.0'),
        port=parse_int(os.getenv('BACKEND_PORT'), 8000),
        allowed_models=parse_csv(os.getenv('ST_ALLOWED_MODELS'), DEFAULT_MODELS),
        allow_dynamic_models=parse_bool(os.getenv('ST_ALLOW_DYNAMIC_MODELS'), True),
        preload_on_startup=parse_bool(os.getenv('ST_PRELOAD_ON_STARTUP'), False),
        device=os.getenv('ST_DEVICE', 'cpu'),
        cache_dir=(os.getenv('ST_CACHE_DIR') or '').strip() or None,
        batch_size=max(1, parse_int(os.getenv('ST_BATCH_SIZE'), 32)),
        cors_allow_origins=parse_csv(
            os.getenv('CORS_ALLOW_ORIGINS'),
            ['http://localhost:5173', 'http://127.0.0.1:5173'],
        ),
    )
