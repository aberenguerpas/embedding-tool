from __future__ import annotations

from threading import RLock

from sentence_transformers import SentenceTransformer

from .config import Settings


class ModelRegistry:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._models: dict[str, SentenceTransformer] = {}
        self._lock = RLock()

    def _is_model_allowed(self, model_id: str) -> bool:
        return self.settings.allow_dynamic_models or model_id in self.settings.allowed_models

    def validate_model_id(self, model_id: str) -> None:
        if not self._is_model_allowed(model_id):
            allowed = ', '.join(self.settings.allowed_models)
            raise ValueError(f'Model `{model_id}` is not allowed. Allowed models: {allowed}')

    def list_allowed_models(self) -> list[str]:
        return list(self.settings.allowed_models)

    def list_loaded_models(self) -> list[str]:
        with self._lock:
            return list(self._models.keys())

    def is_loaded(self, model_id: str) -> bool:
        with self._lock:
            return model_id in self._models

    def get_or_load(self, model_id: str, force_reload: bool = False) -> SentenceTransformer:
        self.validate_model_id(model_id)

        with self._lock:
            if not force_reload and model_id in self._models:
                return self._models[model_id]

            model = SentenceTransformer(
                model_name_or_path=model_id,
                device=self.settings.device,
                cache_folder=self.settings.cache_dir,
            )
            self._models[model_id] = model
            return model

    def download_models(self, model_ids: list[str], force_reload: bool = False) -> list[dict]:
        statuses: list[dict] = []

        for model_id in dict.fromkeys(model_ids):
            self.validate_model_id(model_id)
            already_loaded = self.is_loaded(model_id)
            self.get_or_load(model_id, force_reload=force_reload)
            status = {
                'model_id': model_id,
                'loaded': True,
                'detail': 'reloaded' if already_loaded and force_reload else 'ready',
            }
            statuses.append(status)

        return statuses

    def encode(
        self,
        model_id: str,
        texts: list[str],
        normalize_embeddings: bool,
        batch_size: int | None,
    ) -> list[list[float]]:
        model = self.get_or_load(model_id)
        used_batch_size = batch_size or self.settings.batch_size

        vectors = model.encode(
            texts,
            batch_size=used_batch_size,
            convert_to_numpy=True,
            normalize_embeddings=normalize_embeddings,
            show_progress_bar=False,
        )

        return vectors.tolist()
