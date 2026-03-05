export const MODEL_CATALOG = [
  {
    id: 'sentence-transformers/all-MiniLM-L6-v2',
    label: 'all-MiniLM-L6-v2',
    description: 'Ligero y rapido para baseline general.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/all-mpnet-base-v2',
    label: 'all-mpnet-base-v2',
    description: 'Mejor calidad semantica general, mas pesado.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/all-distilroberta-v1',
    label: 'all-distilroberta-v1',
    description: 'Compromiso entre latencia y calidad en uso general.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    label: 'paraphrase-multilingual-MiniLM-L12-v2',
    description: 'Multilingue, buen baseline para espanol y otros idiomas.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/paraphrase-multilingual-mpnet-base-v2',
    label: 'paraphrase-multilingual-mpnet-base-v2',
    description: 'Multilingue con mejor calidad semantica que MiniLM.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/distiluse-base-multilingual-cased-v2',
    label: 'distiluse-base-multilingual-cased-v2',
    description: 'Modelo multilingue robusto para frases cortas.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/LaBSE',
    label: 'LaBSE',
    description: 'Multilingue fuerte para matching entre idiomas.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/multi-qa-mpnet-base-dot-v1',
    label: 'multi-qa-mpnet-base-dot-v1',
    description: 'Orientado a retrieval QA, suele mejorar ranking top-k.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/multi-qa-MiniLM-L6-cos-v1',
    label: 'multi-qa-MiniLM-L6-cos-v1',
    description: 'Version QA mas ligera para menor latencia.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/msmarco-distilbert-base-v4',
    label: 'msmarco-distilbert-base-v4',
    description: 'Fuerte en retrieval tipo buscador con consultas cortas.',
    promptName: null,
  },
  {
    id: 'sentence-transformers/msmarco-MiniLM-L6-cos-v5',
    label: 'msmarco-MiniLM-L6-cos-v5',
    description: 'Retrieval rapido entrenado para ranking en buscadores.',
    promptName: null,
  },
]

export const DEFAULT_DOCUMENTS_TEXT = `Parque movil por distrito en la ciudad de Madrid
Accidentes de trafico con victimas en Madrid por barrio y fecha
Puntos de recarga para vehiculos electricos en la Comunidad de Madrid
Aparcamientos publicos municipales y plazas disponibles en Madrid
Matriculaciones de turismos por provincia en Espana
Inventario de estaciones ITV en la Comunidad de Madrid
Emisiones de NO2 y PM10 por estacion de calidad del aire en Madrid
Intensidad media diaria de trafico en M-30 y vias urbanas de Madrid
Licencias de taxi y VTC activas por municipio en la Comunidad de Madrid
Estaciones y lineas de Metro de Madrid con accesibilidad
Consumo de combustible por tipo de vehiculo en Espana
Siniestralidad vial por tipo de via y franja horaria en Madrid`

export const DEFAULT_QUERIES_TEXT = `Coches en Madrid
coches electricos en madrid
accidentes de trafico en madrid
matriculaciones de turismos en madrid
aparcamientos publicos en madrid`
