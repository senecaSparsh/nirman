// Translates browser network jargon ("Failed to fetch", "Load failed",
// "NetworkError when attempting to fetch resource") into words a
// non-technical user understands. Installed once at app root; every
// `await fetch()` then surfaces human-readable err.message in catch
// blocks and toasts.

let installed = false;

export function installFriendlyFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    try {
      return await origFetch(...args);
    } catch (err) {
      // Keep TypeError so retry logic (use-api-action) still detects
      // network failures; original error stays on .cause for debugging.
      if (err instanceof TypeError) {
        throw new TypeError(
          "No internet connection. Check your connection and try again.",
          { cause: err },
        );
      }
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new DOMException("This is taking too long. Try again.", "TimeoutError");
      }
      throw err;
    }
  };
}
