from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class ModelStatus(BaseModel):
    model_id: str
    loaded: bool


class ModelsResponse(BaseModel):
    allowed_models: list[str]
    loaded_models: list[str]
    statuses: list[ModelStatus]


class DownloadModelsRequest(BaseModel):
    model_ids: list[str] = Field(min_length=1)
    force_reload: bool = False


class DownloadedModelStatus(BaseModel):
    model_id: str
    loaded: bool
    detail: str


class DownloadModelsResponse(BaseModel):
    downloaded: list[DownloadedModelStatus]


class EmbeddingsRequest(BaseModel):
    model_id: str
    texts: list[str] = Field(min_length=1)
    normalize_embeddings: bool = True
    batch_size: int | None = Field(default=None, ge=1, le=512)


class EmbeddingsResponse(BaseModel):
    model_id: str
    count: int
    dimensions: int
    normalize_embeddings: bool
    embeddings: list[list[float]]
    elapsed_ms: float
