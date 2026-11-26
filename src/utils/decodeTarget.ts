export type DecodeTarget = 'local' | 'server';

export const DECODE_TARGET_STORAGE_KEY = 'fm27_decode_target_v1';

export function isMobileUserAgent(userAgent: string | undefined | null): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent || '');
}

export function defaultDecodeTarget(isMobile: boolean): DecodeTarget {
  return isMobile ? 'local' : 'server';
}

export function resolveDecodeTarget(
  storedValue: unknown,
  isMobile: boolean
): DecodeTarget {
  return storedValue === 'local' || storedValue === 'server'
    ? storedValue
    : defaultDecodeTarget(isMobile);
}

export function shouldPrewarmLocalDecoder(params: {
  target: DecodeTarget;
  online: boolean;
  saveData?: boolean;
  effectiveType?: string;
  deviceMemoryGb?: number;
}): boolean {
  if (params.target !== 'local' || !params.online || params.saveData) return false;
  if (params.effectiveType === 'slow-2g' || params.effectiveType === '2g') {
    return false;
  }
  if (
    typeof params.deviceMemoryGb === 'number' &&
    params.deviceMemoryGb < 4
  ) {
    return false;
  }
  return true;
}
