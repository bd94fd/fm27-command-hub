import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export type { User };

export const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
];

let authPromise: Promise<{
  auth: Auth;
  provider: GoogleAuthProvider;
  authMod: typeof import('firebase/auth');
}> | null = null;

async function getFirebaseAuthInstance() {
  if (!authPromise) {
    authPromise = (async () => {
      const [{ initializeApp }, authMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
      ]);
      const app = initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      const provider = new authMod.GoogleAuthProvider();
      for (const scope of SCOPES) {
        provider.addScope(scope);
      }
      return { auth, provider, authMod };
    })();
  }
  return authPromise;
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function isUnauthorizedDomainError(error: unknown): boolean {
  if (!error) return false;
  if (
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'auth/unauthorized-domain'
  ) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('auth/unauthorized-domain');
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
): (() => void) => {
  let activeUnsub: (() => void) | null = null;
  let cancelled = false;

  void getFirebaseAuthInstance()
    .then(({ auth, authMod }) => {
      if (cancelled) return;
      activeUnsub = authMod.onAuthStateChanged(
        auth,
        async (user: User | null) => {
          if (user) {
            if (cachedAccessToken) {
              if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
            } else if (!isSigningIn) {
              cachedAccessToken = null;
              if (onAuthFailure) onAuthFailure();
            }
          } else {
            cachedAccessToken = null;
            if (onAuthFailure) onAuthFailure();
          }
        },
        (error) => {
          if (isUnauthorizedDomainError(error)) {
            console.warn(
              'Firebase Auth unauthorized domain (ignored in UI):',
              error
            );
            return;
          }
          console.error('Firebase Auth state error:', error);
        }
      );
    })
    .catch((error) => {
      if (isUnauthorizedDomainError(error)) {
        console.warn(
          'Firebase Auth unauthorized domain (ignored in UI):',
          error
        );
        return;
      }
      console.error('Firebase Auth load error:', error);
    });

  return () => {
    cancelled = true;
    if (activeUnsub) {
      activeUnsub();
    }
  };
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const { auth, provider, authMod } = await getFirebaseAuthInstance();
    const result = await authMod.signInWithPopup(auth, provider);
    const credential = authMod.GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google OAuth access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    if (isUnauthorizedDomainError(error)) {
      console.warn('Firebase Auth unauthorized domain (ignored in UI):', error);
      return null;
    }
    console.error('Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  if (authPromise) {
    const { auth } = await authPromise;
    await auth.signOut();
  }
  cachedAccessToken = null;
};

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
  accessToken: string
): Promise<GoogleDocInfo> {
  const documentId = extractGoogleFileId(rawIdOrUrl);
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Failed to read Google Doc (${res.status})`
    );
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
 * Directly appends a formatted chronological event into the user's Google Doc
 * right above [INSERT NEXT CHRONOLOGICAL EVENT HERE] (or at the end of the document if the tag is not found).
 */
export async function appendEventToGoogleDoc(
  rawIdOrUrl: string,
  eventTextBlock: string,
  accessToken: string
): Promise<{ title: string; insertedAtAnchor: boolean }> {
  const info = await fetchGoogleDocInfo(rawIdOrUrl, accessToken);
  const insertIndex =
    info.anchorIndex !== null
      ? info.anchorIndex
      : Math.max(1, info.endIndex - 1);

  const formattedPayload =
    info.anchorIndex !== null
      ? `${eventTextBlock.trim()}\n\n`
      : `\n\n${eventTextBlock.trim()}\n[INSERT NEXT CHRONOLOGICAL EVENT HERE]\n`;

  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(
      info.documentId
    )}:batchUpdate`,
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
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Failed to update Google Doc (${res.status})`
    );
  }

  return {
    title: info.title,
    insertedAtAnchor: info.anchorIndex !== null,
  };
}

/**
 * Replaces or initializes a Google Doc with the complete repaired KVV Zelzate Master Blueprint (Events #1-#33).
 */
export async function writeFullMasterBlueprintToDoc(
  rawIdOrUrl: string,
  fullText: string,
  accessToken: string
): Promise<{ title: string }> {
  const info = await fetchGoogleDocInfo(rawIdOrUrl, accessToken);
  const requests: Record<string, unknown>[] = [];

  if (info.endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: info.endIndex - 1,
        },
      },
    });
  }

  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });

  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(
      info.documentId
    )}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Failed to write Master Blueprint to Google Doc (${res.status})`
    );
  }

  return { title: info.title };
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
  accessToken: string
): Promise<GoogleSheetMetadata> {
  const spreadsheetId = extractGoogleFileId(rawIdOrUrl);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Failed to read Google Spreadsheet (${res.status})`
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
  accessToken: string
): Promise<void> {
  const spreadsheetId = extractGoogleFileId(rawIdOrUrl);
  const range = `'${sheetTabName.replace(/'/g, "''")}'!A:G`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(
      range
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message ||
        `Failed to append row to sheet tab "${sheetTabName}" (${res.status})`
    );
  }
}
