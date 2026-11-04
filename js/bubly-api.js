(() => {
  const base = String(window.BUBLY_CONFIG?.apiBase || '').replace(/\/+$/, '');
  const TOKEN_KEY = 'order_of_bubly_api_token_v1';

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function setToken(token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('Failed to store admin token', error);
    }
  }

  function clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      console.error('Failed to clear admin token', error);
    }
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const hasBody = options.body !== undefined;

    if (hasBody) headers['Content-Type'] = 'application/json';
    if (options.auth !== false) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${base}${path}`, {
        method: options.method || 'GET',
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        cache: 'no-store'
      });
    } catch (cause) {
      const error = new Error(`Cannot reach the imperial ledger at ${base}. Is the API running?`);
      error.cause = cause;
      throw error;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      if (response.status === 401 && options.auth !== false) clearToken();
      const error = new Error(data?.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async function login(password) {
    const session = await request('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { password }
    });
    setToken(session.token);
    return session;
  }

  async function getSession() {
    if (!getToken()) return { authenticated: false };
    return request('/api/auth/session');
  }

  async function getState() {
    return request('/api/state', { auth: false });
  }

  async function saveState(state, version) {
    return request('/api/admin/state', {
      method: 'PUT',
      body: { state, version }
    });
  }

  window.BublyAPI = {
    base,
    getToken,
    setToken,
    clearToken,
    hasToken: () => Boolean(getToken()),
    login,
    getSession,
    getState,
    saveState
  };
})();
