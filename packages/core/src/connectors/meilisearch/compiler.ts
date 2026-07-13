import type {
  ISearchCollectionDefinition,
  ISearchEmbedConfig,
  ISearchFieldDefinition,
  ISynonym,
} from '@/connectors/search/models';
import { SearchFieldTypes, VectorDistances } from '@/connectors/search/models';
import { getError } from '@venizia/ignis-helpers';
import omit from 'lodash/omit';

/** Meilisearch's single reserved geo field. It is an object `{ lat, lng }`, not a named tuple. */
const RESERVED_GEO_FIELD_NAME = '_geo';

const RESERVED_ID_FIELD_NAME = 'id';

/**
 * Meilisearch is schemaless, so a collection compiles to an index uid plus a settings object rather
 * than a field schema. The DSL's `searchable`/`filterable` flags - dropped by the Typesense compiler,
 * which indexes every field - are load-bearing here.
 */
export interface IMeilisearchIndexPlan {
  uid: string;
  primaryKey?: string;
  settings: Record<string, unknown>;
}

/** Neutral `<provider>/<model>` name -> Meilisearch's `source` discriminator. */
const EMBED_SOURCE_BY_PROVIDER: Record<string, string> = {
  openai: 'openAi',
  huggingface: 'huggingFace',
  ollama: 'ollama',
  rest: 'rest',
};

const buildEmbedder = (opts: {
  field: string;
  embed: ISearchEmbedConfig;
}): Record<string, unknown> => {
  const { field, embed } = opts;
  const [provider, ...modelParts] = embed.model.name.split('/');
  const source = EMBED_SOURCE_BY_PROVIDER[provider.toLowerCase()];

  if (!source) {
    throw getError({
      message: `[compileMeilisearchCollection] Unsupported embed provider | field: ${field} | model: ${embed.model.name} | supported: ${Object.keys(EMBED_SOURCE_BY_PROVIDER).join(', ')}`,
    });
  }

  const providerConfig = omit(embed.model, ['name']);
  const documentTemplate = embed.from.map(item => `{{doc.${item}}}`).join(' ');

  return { source, model: modelParts.join('/'), ...providerConfig, documentTemplate };
};

/** `root` set = one-way (only the root maps to its synonyms); absent = multi-way (all interchangeable). */
const buildSynonymDictionary = (opts: { synonyms: ISynonym[] }): Record<string, string[]> => {
  const dictionary: Record<string, string[]> = {};

  for (const entry of opts.synonyms) {
    if (entry.root) {
      dictionary[entry.root] = entry.synonyms;
      continue;
    }

    for (const term of entry.synonyms) {
      dictionary[term] = entry.synonyms.filter(other => other !== term);
    }
  }

  return dictionary;
};

const assertGeopoint = (opts: { definition: ISearchCollectionDefinition }): void => {
  const { definition } = opts;
  const geoFields = definition.fields.filter(item => item.type === SearchFieldTypes.GEOPOINT);

  if (geoFields.length === 0) {
    return;
  }

  if (geoFields.length > 1) {
    throw getError({
      message: `[compileMeilisearchCollection] Meilisearch supports exactly one geo field | collection: ${definition.name} | found: ${geoFields.map(item => item.name).join(', ')}`,
    });
  }

  if (geoFields[0].name !== RESERVED_GEO_FIELD_NAME) {
    throw getError({
      message: `[compileMeilisearchCollection] Meilisearch's geo field must be named '${RESERVED_GEO_FIELD_NAME}' and shaped { lat, lng } | collection: ${definition.name} | field: ${geoFields[0].name}`,
    });
  }
};

const assertVectorDistance = (opts: { field: ISearchFieldDefinition }): void => {
  const { field } = opts;
  const distance = field.vector?.distance;

  if (distance === undefined || distance === VectorDistances.COSINE) {
    return;
  }

  throw getError({
    message: `[compileMeilisearchCollection] Meilisearch supports only cosine vector distance | field: ${field.name} | distance: ${distance}`,
  });
};

/** Compiles the neutral collection DSL into a Meilisearch index plan. */
export const compileMeilisearchCollection = (opts: {
  definition: ISearchCollectionDefinition;
}): IMeilisearchIndexPlan => {
  const { definition } = opts;
  const { name, fields, defaultSort, synonyms, engineOverrides } = definition;

  assertGeopoint({ definition });

  const searchableAttributes: string[] = [];
  const filterableAttributes: string[] = [];
  const sortableAttributes: string[] = [];
  const embedders: Record<string, unknown> = {};
  let primaryKey: string | undefined;

  for (const item of fields) {
    if (item.name === RESERVED_ID_FIELD_NAME) {
      primaryKey = item.name;
    }

    if (item.searchable) {
      searchableAttributes.push(item.name);
    }

    if (item.filterable) {
      filterableAttributes.push(item.name);
    }

    if (item.sortable) {
      sortableAttributes.push(item.name);
    }

    if (item.type !== SearchFieldTypes.VECTOR) {
      continue;
    }

    assertVectorDistance({ field: item });

    embedders[item.name] = item.vector?.embed
      ? buildEmbedder({ field: item.name, embed: item.vector.embed })
      : { source: 'userProvided', dimensions: item.vector?.dimensions };
  }

  if (defaultSort !== undefined && !sortableAttributes.includes(defaultSort)) {
    throw getError({
      message: `[compileMeilisearchCollection] Meilisearch has no default_sorting_field, so defaultSort must name a sortable field | collection: ${name} | defaultSort: ${defaultSort}`,
    });
  }

  const settings: Record<string, unknown> = {
    // An empty array would disable search entirely; `['*']` is Meilisearch's own default.
    searchableAttributes: searchableAttributes.length > 0 ? searchableAttributes : ['*'],
    filterableAttributes,
    sortableAttributes,
  };

  if (synonyms?.length) {
    settings['synonyms'] = buildSynonymDictionary({ synonyms });
  }

  if (Object.keys(embedders).length > 0) {
    settings['embedders'] = embedders;
  }

  const override = engineOverrides?.meilisearch;

  return {
    uid: name,
    ...(primaryKey ? { primaryKey } : {}),
    settings: override ? { ...settings, ...override } : settings,
  };
};
