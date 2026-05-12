(function () {
  var cfg = window.__APP_CONFIG__ || {};
  cfg.API_BASE_URL = cfg.API_BASE_URL ?? "";
  window.__APP_CONFIG__ = cfg;
})();
