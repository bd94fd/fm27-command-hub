# Save cache by content fingerprint (R15)

Date: 26 November 2026
Status: working in a mobile Chromium proxy; physical Android confirmation still required

Before R15 the decoded save cache was keyed only by file name and in-game date. That is not enough to reuse a decoded save before decoding it, because the in-game date is only known after the decode. R15 adds a content fingerprint and checks the cache before any upload or Python decode.

## Fingerprint

`computeSaveFileFingerprint` reads the file in 4 MB chunks and chains SHA-256 over the chunks, with the file size included in the result.

A single `arrayBuffer()` or `subtle.digest()` call on a 250 MB save would create a second 250 MB buffer on the phone. The chunked version keeps memory flat: one 4 MB buffer plus the rolling 32-byte digest.

The fingerprint looks like:

```
r15:263695564:4f1c...e2
```

It contains no player or save content. It is only used as an IndexedDB key.

## Cache key

```
fp::r15-v1::<scope>::<full|fast>::<fingerprint>
```

- `r15-v1` is a schema version. Bump `DECODED_CACHE_SCHEMA_VERSION` whenever the decoded payload shape changes, so old entries are never reused after an incompatible change.
- Scope and sync mode are part of the key because `club_and_division` vs `managed_club_only`, and Full Sync vs Fast Sync, produce different payloads.
- The cache keeps the same five-save ceiling and quota eviction as the existing decoded-save cache.

## Flow

1. Read the chosen `.fm` file and compute its fingerprint.
2. Look up the decoded payload in IndexedDB.
3. **Hit:** validate the payload, hydrate it, update snapshots and Journey, show a green notice that the decode was skipped.
4. **Miss:** run the existing upload/decode path, then store the decoded payload under the fingerprint.
5. A corrupt or incompatible cached payload fails validation and is treated as a miss. The next successful decode replaces it.

The cache is local to the browser profile. It is not uploaded and does not share data between devices.

## Measured result

Same 252 MB `auto_save.fm`, same browser profile, mobile Chromium proxy:

| Import | Cache | Wall time | Notes |
| --- | --- | ---: | --- |
| First | miss | 26.8 s | 865 ms fingerprint, 20.5 s native decode |
| Second | **hit** | **1.04 s** | 885 ms fingerprint, 65 ms hydrate, 58 ms render |

The second import skipped upload and decode entirely and still produced `Squad (47)`. The cache-hit notice appeared once.

## Tests

- `src/utils/saveFileFingerprint.test.ts`: stable for identical bytes, changes with one changed byte, multi-chunk input, size prefix, empty file.
- `src/services/fingerprintCache.test.ts`: key separates scope and mode, payload round-trips by fingerprint, Fast Sync cannot read a Full Sync payload.
- `src/utils/saveLoadBenchmark.test.ts`: a cache hit is recorded separately from decode stages.

## Follow-up

- Confirm the fingerprint speed and cache hit on a physical Android device.
- If an installed-PWA import feels slower because of hashing, surface the fingerprint step in the progress label. The current label already says “Reading …”.
