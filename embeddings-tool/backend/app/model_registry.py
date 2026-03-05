from __future__ import annotations

from threading import RLock

from sentence_transformers import CrossEncoder, SentenceTransformer

from .config import Settings


class ModelRegistry:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._models: dict[str, SentenceTransformer] = {}
        self._rerankers: dict[str, CrossEncoder] = {}
        self._lock = RLock()

    def _is_model_allowed(self, model_id: str) -> bool:
        return self.settings.allow_dynamic_models or model_id in self.settings.allowed_models

    def _is_reranker_allowed(self, model_id: str) -> bool:
        return self.settings.allow_dynamic_rerankers or model_id in self.settings.allowed_rerankers

    def validate_model_id(self, model_id: str) -> None:
        if not self._is_model_allowed(model_id):
            allowed = ', '.join(self.settings.allowed_models)
            raise ValueError(f'Model `{model_id}` is not allowed. Allowed models: {allowed}')

    def validate_reranker_id(self, model_id: str) -> None:
        if not self._is_reranker_allowed(model_id):
            allowed = ', '.join(self.settings.allowed_rerankers)
            raise ValueError(
                f'Reranker `{model_id}` is not allowed. Allowed rerankers: {allowed}'
            )

    def list_allowed_models(self) -> list[str]:
        return list(self.settings.allowed_models)

    def list_allowed_rerankers(self) -> list[str]:
        return list(self.settings.allowed_rerankers)

    def list_loaded_models(self) -> list[str]:
        with self._lock:
            return list(self._models.keys())

    def list_loaded_rerankers(self) -> list[str]:
        with self._lock:
            return list(self._rerankers.keys())

    def is_loaded(self, model_id: str) -> bool:
        with self._lock:
            return model_id in self._models

    def is_reranker_loaded(self, model_id: str) -> bool:
        with self._lock:
            return model_id in self._rerankers

    def get_or_load(self, model_id: str, force_reload: bool = False) -> SentenceTransformer:
        self.validate_model_id(model_id)

        with self._lock:
            if not force_reload and model_id in self._models:
                return self._models[model_id]

            model = SentenceTransformer(
                model_name_or_path=model_id,
                device=self.settings.device,
                cache_folder=self.settings.cache_dir,
                trust_remote_code=True,
            )
            self._models[model_id] = model
            return model

    def get_or_load_reranker(self, model_id: str, force_reload: bool = False) -> CrossEncoder:
        self.validate_reranker_id(model_id)

        with self._lock:
            if not force_reload and model_id in self._rerankers:
                return self._rerankers[model_id]

            model = CrossEncoder(
                model_name=model_id,
                device=self.settings.device,
                cache_dir=self.settings.cache_dir,
                trust_remote_code=True,
            )
            # Some rerankers (for example certain Qwen variants) do not define a pad token.
            # CrossEncoder may run with batch_size > 1, which requires padding.
            tokenizer = getattr(model, 'tokenizer', None)
            if tokenizer is not None and tokenizer.pad_token is None:
                if tokenizer.eos_token is not None:
                    tokenizer.pad_token = tokenizer.eos_token
                elif tokenizer.unk_token is not None:
                    tokenizer.pad_token = tokenizer.unk_token

            self._rerankers[model_id] = model
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

    def download_rerankers(self, model_ids: list[str], force_reload: bool = False) -> list[dict]:
        statuses: list[dict] = []

        for model_id in dict.fromkeys(model_ids):
            self.validate_reranker_id(model_id)
            already_loaded = self.is_reranker_loaded(model_id)
            self.get_or_load_reranker(model_id, force_reload=force_reload)
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

    def rerank(
        self,
        model_id: str,
        queries: list[str],
        documents: list[str],
        top_k: int | None,
    ) -> list[list[dict]]:
        model = self.get_or_load_reranker(model_id)
        effective_top_k = top_k or len(documents)
        effective_top_k = max(1, min(effective_top_k, len(documents)))

        query_rankings: list[list[dict]] = []

        for query in queries:
            pairs = [(query, document) for document in documents]
            try:
                scores = model.predict(
                    pairs,
                    batch_size=self.settings.batch_size,
                    show_progress_bar=False,
                )
            except ValueError as error:
                # Fallback for models/tokenizers that cannot pad batched inputs.
                if 'Cannot handle batch sizes > 1 if no padding token is defined' not in str(error):
                    raise
                scores = model.predict(
                    pairs,
                    batch_size=1,
                    show_progress_bar=False,
                )
            scores_list = [float(score) for score in scores]

            ranking = [
                {
                    'doc_index': doc_index,
                    'document': documents[doc_index],
                    'score': score,
                }
                for doc_index, score in enumerate(scores_list)
            ]
            ranking.sort(key=lambda item: item['score'], reverse=True)
            query_rankings.append(ranking[:effective_top_k])

        return query_rankings
