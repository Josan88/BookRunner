(function () {
  var cfg = window.__APP_CONFIG__ || {};
  cfg.API_BASE_URL = cfg.API_BASE_URL ?? "";
  cfg.getApiUrl = function (path) {
    var normalizedPath = String(path || "").replace(/^\/+/, "");
    var apiBaseUrl = String(cfg.API_BASE_URL || "").replace(/\/+$/, "");
    return apiBaseUrl ? apiBaseUrl + "/" + normalizedPath : normalizedPath;
  };
  window.__APP_CONFIG__ = cfg;
})();
