from pydantic import BaseModel, Field, field_validator


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

    @field_validator('model_ids')
    @classmethod
    def validate_model_ids(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []

        for value in values:
            model_id = value.strip()
            if not model_id:
                raise ValueError('model_ids cannot contain empty values')
            cleaned.append(model_id)

        # Remove duplicates while preserving order.
        return list(dict.fromkeys(cleaned))


class DownloadedModelStatus(BaseModel):
    model_id: str
    loaded: bool
    detail: str


class DownloadModelsResponse(BaseModel):
    downloaded: list[DownloadedModelStatus]


class EmbeddingsRequest(BaseModel):
    model_id: str = Field(min_length=1)
    texts: list[str] = Field(min_length=1)
    normalize_embeddings: bool = True
    batch_size: int | None = Field(default=None, ge=1, le=512)

    @field_validator('model_id')
    @classmethod
    def validate_model_id(cls, value: str) -> str:
        model_id = value.strip()
        if not model_id:
            raise ValueError('model_id cannot be empty')
        return model_id

    @field_validator('texts')
    @classmethod
    def validate_texts(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []

        for value in values:
            text = value.strip()
            if not text:
                raise ValueError('texts cannot contain empty values')
            cleaned.append(text)

        return cleaned


class EmbeddingsResponse(BaseModel):
    model_id: str
    count: int
    dimensions: int
    normalize_embeddings: bool
    embeddings: list[list[float]]
    elapsed_ms: float
