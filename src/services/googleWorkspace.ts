import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_WORKSPACE_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function initGoogleAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
): () => void {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string;
} | null> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google OAuth access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export const googleSignIn = signInWithGoogleWorkspace;

export async function getAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export async function logoutGoogleWorkspace(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

/**
 * Extracts a Google Document ID or Spreadsheet ID from either a full Google URL or a raw ID string.
 */
export function extractGoogleFileId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const docMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (docMatch && docMatch[1]) return docMatch[1];
  const sheetMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetMatch && sheetMatch[1]) return sheetMatch[1];
  return trimmed;
}

export interface GoogleDocInfo {
  documentId: string;
  title: string;
  endIndex: number;
  anchorIndex: number | null;
}

/**
 * Fetches Google Doc metadata and locates the [INSERT NEXT CHRONOLOGICAL EVENT HERE] anchor tag index if present.
 */
export async function fetchGoogleDocInfo(
  rawIdOrUrl: string,
  accessToken: string,
): Promise<GoogleDocInfo> {
  const documentId = extractGoogleFileId(rawIdOrUrl);
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Failed to read Google Doc (${res.status})`);
  }
  const doc = await res.json();
  const content = doc.body?.content || [];
  let endIndex = 1;
  let anchorIndex: number | null = null;
  const anchorTag = '[INSERT NEXT CHRONOLOGICAL EVENT HERE]';

  for (const structuralEl of content) {
    if (typeof structuralEl.endIndex === 'number') {
      endIndex = structuralEl.endIndex;
    }
    const elements = structuralEl.paragraph?.elements || [];
    for (const el of elements) {
      const textContent: string = el.textRun?.content || '';
      const idx = textContent.indexOf(anchorTag);
      if (idx !== -1 && typeof el.startIndex === 'number') {
        anchorIndex = el.startIndex + idx;
      }
    }
  }

  return {
    documentId,
    title: doc.title || 'Untitled Document',
    endIndex,
    anchorIndex,
  };
}

/**
 * Non-destructively inserts a formatted chronological event into a Google Doc
 * directly above [INSERT NEXT CHRONOLOGICAL EVENT HERE] (or appends at end if not present).
 */
export async function appendEventToGoogleDoc(
  rawIdOrUrl: string,
  eventTextBlock: string,
  accessToken: string,
): Promise<{ title: string; insertedAtAnchor: boolean }> {
  const info = await fetchGoogleDocInfo(rawIdOrUrl, accessToken);
  const insertIndex =
    info.anchorIndex !== null ? info.anchorIndex : Math.max(1, info.endIndex - 1);

  const formattedPayload =
    info.anchorIndex !== null
      ? `${eventTextBlock.trim()}\n\n`
      : `\n\n${eventTextBlock.trim()}\n[INSERT NEXT CHRONOLOGICAL EVENT HERE]\n`;

  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(info.documentId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: insertIndex },
              text: formattedPayload,
            },
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Failed to update Google Doc (${res.status})`);
  }

  return {
    title: info.title,
    insertedAtAnchor: info.anchorIndex !== null,
  };
}

export interface GoogleSheetMetadata {
  spreadsheetId: string;
  title: string;
  sheetNames: string[];
}

/**
 * Fetches Google Spreadsheet title and all tab names so we never hardcode "Sheet1".
 */
export async function fetchGoogleSheetMetadata(
  rawIdOrUrl: string,
  accessToken: string,
): Promise<GoogleSheetMetadata> {
  const spreadsheetId = extractGoogleFileId(rawIdOrUrl);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}?fields=properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Failed to read Google Spreadsheet (${res.status})`,
    );
  }
  const data = await res.json();
  const sheetNames: string[] = (data.sheets || [])
    .map((s: { properties?: { title?: string } }) => s.properties?.title || '')
    .filter(Boolean);

  return {
    spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    sheetNames,
  };
}

/**
 * Appends a row of values directly to the selected tab in the user's Google Sheet.
 */
export async function appendRowToGoogleSheet(
  rawIdOrUrl: string,
  sheetTabName: string,
  rowValues: string[],
  accessToken: string,
): Promise<void> {
  const spreadsheetId = extractGoogleFileId(rawIdOrUrl);
  const range = `'${sheetTabName.replace(/'/g, "''")}'!A:Z`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    },
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Failed to append row to sheet tab "${sheetTabName}" (${res.status})`,
    );
  }
}
