import axios from 'axios';

// Auth is carried by an HttpOnly cookie set by the backend (not readable by JS,
// so it can't be stolen via XSS). withCredentials ensures the cookie is sent.
const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('edm_user');
      localStorage.removeItem('edm_last_active');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
