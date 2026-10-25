// Deployment-local, project-scoped best-effort protection. Google may evict cache early.
function passwordThrottleKey_(scope) {
  return "password-failures-" + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(scope || "legacy"), Utilities.Charset.UTF_8).map((byte) => (byte & 255).toString(16).padStart(2, "0")).join("");
}
function passwordAttemptBlocked_(scope) {
  return Number(CacheService.getScriptCache().get(passwordThrottleKey_(scope)) || 0) >= 10;
}
function notePasswordFailure_(scope) {
  const cache = CacheService.getScriptCache();
  const key = passwordThrottleKey_(scope);
  cache.put(key, String(Number(cache.get(key) || 0) + 1), 60);
}
function clearPasswordFailures_(scope) {
  CacheService.getScriptCache().remove(passwordThrottleKey_(scope));
}
