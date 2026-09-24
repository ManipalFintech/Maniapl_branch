// Turns raw Supabase / network errors into messages people can act on.
export function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const msg = String(err.message || err.error_description || err || '');
  const name = err.name || '';

  if (name === 'AbortError' || /aborted|timed? ?out/i.test(msg)) {
    return 'The request timed out. Check your internet connection and try again.';
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }
  if (/jwt expired|invalid jwt|refresh token|session.*(expired|missing)/i.test(msg)) {
    return 'Your session has expired. Please sign out and sign in again.';
  }
  return msg || 'Something went wrong. Please try again.';
}

export function toError(err) {
  return new Error(friendlyError(err));
}
