import 'server-only';

import { docs_v1, google } from 'googleapis';

import { createAdminClient } from '@/lib/supabase/admin';

const CACHE_KEY = 'advisor-documents';

type CacheRow = {
  prompt_text: string;
  reference_text: string;
  fetched_at: string;
};

export type AdvisorDocuments = {
  promptText: string;
  referenceText: string;
  fetchedAt: string;
  source: 'google' | 'cache' | 'stale-cache';
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing server configuration: ${name}`);
  }

  return value;
}

function getCacheTtlMilliseconds(): number {
  const value = process.env.GOOGLE_DOC_CACHE_TTL_SECONDS ?? '300';
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      'GOOGLE_DOC_CACHE_TTL_SECONDS must be a positive number'
    );
  }

  return seconds * 1000;
}

function getServiceAccountCredentials() {
  const encodedCredentials = requireEnvironmentVariable(
    'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64'
  );

  try {
    const decodedCredentials = Buffer.from(
      encodedCredentials,
      'base64'
    ).toString('utf8');

    const credentials = JSON.parse(decodedCredentials) as {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    };

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Required service-account fields are missing');
    }

    return {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
      project_id: credentials.project_id,
    };
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid'
    );
  }
}

function extractDocumentText(
  elements: docs_v1.Schema$StructuralElement[] = []
): string {
  return elements
    .map((element) => {
      if (element.paragraph) {
        return (element.paragraph.elements ?? [])
          .map((item) => item.textRun?.content ?? '')
          .join('');
      }

      if (element.table) {
        return (element.table.tableRows ?? [])
          .map((row) =>
            (row.tableCells ?? [])
              .map((cell) => extractDocumentText(cell.content ?? []))
              .join('\t')
          )
          .join('\n');
      }

      if (element.tableOfContents) {
        return extractDocumentText(
          element.tableOfContents.content ?? []
        );
      }

      return '';
    })
    .join('')
    .trim();
}

async function fetchGoogleDocument(
  service: docs_v1.Docs,
  documentId: string
): Promise<string> {
  const response = await service.documents.get({
    documentId,
  });

  const text = extractDocumentText(response.data.body?.content ?? []);

  if (!text) {
    throw new Error('A required Google document is empty');
  }

  return text;
}

async function readCachedDocuments(): Promise<CacheRow | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('advisor_document_cache')
    .select('prompt_text, reference_text, fetched_at')
    .eq('cache_key', CACHE_KEY)
    .maybeSingle();

  if (error) {
    throw new Error('Unable to read the advisor document cache');
  }

  return data as CacheRow | null;
}

async function saveCachedDocuments(
  promptText: string,
  referenceText: string,
  fetchedAt: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('advisor_document_cache')
    .upsert(
      {
        cache_key: CACHE_KEY,
        prompt_text: promptText,
        reference_text: referenceText,
        fetched_at: fetchedAt,
      },
      {
        onConflict: 'cache_key',
      }
    );

  if (error) {
    throw new Error('Unable to update the advisor document cache');
  }
}

export async function loadAdvisorDocuments(): Promise<AdvisorDocuments> {
  const cachedDocuments = await readCachedDocuments();
  const cacheTtl = getCacheTtlMilliseconds();

  if (cachedDocuments) {
    const cacheAge =
      Date.now() - new Date(cachedDocuments.fetched_at).getTime();

    if (cacheAge >= 0 && cacheAge < cacheTtl) {
      return {
        promptText: cachedDocuments.prompt_text,
        referenceText: cachedDocuments.reference_text,
        fetchedAt: cachedDocuments.fetched_at,
        source: 'cache',
      };
    }
  }

  try {
    const credentials = getServiceAccountCredentials();

    const authentication = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/documents.readonly',
      ],
    });

    const service = google.docs({
      version: 'v1',
      auth: authentication,
    });

    const promptDocumentId = requireEnvironmentVariable(
      'GOOGLE_PROMPT_DOC_ID'
    );

    const referenceDocumentId = requireEnvironmentVariable(
      'GOOGLE_REFERENCE_DOC_ID'
    );

    const [promptText, referenceText] = await Promise.all([
      fetchGoogleDocument(service, promptDocumentId),
      fetchGoogleDocument(service, referenceDocumentId),
    ]);

    const fetchedAt = new Date().toISOString();

    await saveCachedDocuments(
      promptText,
      referenceText,
      fetchedAt
    );

    return {
      promptText,
      referenceText,
      fetchedAt,
      source: 'google',
    };
    } catch (error) {
    console.error(
      'Advisor document loading failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    if (cachedDocuments) {
      return {
        promptText: cachedDocuments.prompt_text,
        referenceText: cachedDocuments.reference_text,
        fetchedAt: cachedDocuments.fetched_at,
        source: 'stale-cache',
      };
    }

    throw new Error(
      'Advisor documents are currently unavailable'
    );
  }
}