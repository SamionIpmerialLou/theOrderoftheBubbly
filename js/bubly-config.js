window.BUBLY_CONFIG = {
  apiBase: (() => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]' || host === '::1') {
      return 'http://127.0.0.1:8787';
    }
    return 'https://api.lordbubly.com';
  })()
};
