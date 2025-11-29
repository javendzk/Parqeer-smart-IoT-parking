import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
});

const withAuth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const unwrap = (promise) => promise.then((res) => res.data);

const getSlots = () => unwrap(apiClient.get('/slots'));
const createBooking = (payload) => unwrap(apiClient.post('/book', payload));
const getVoucher = (code) => unwrap(apiClient.get(`/voucher/${code}`));
const getTransaction = (transactionId) => unwrap(apiClient.get(`/payment/${transactionId}`));
const payTransaction = (transactionId) => unwrap(apiClient.post(`/payment/${transactionId}/pay`));
const adminLogin = (payload) => unwrap(apiClient.post('/admin/login', payload));
const getAdminOverview = (token) => unwrap(apiClient.get('/admin/overview', withAuth(token)));
const resetSlot = (token, payload) => unwrap(apiClient.post('/admin/reset-slot', payload, withAuth(token)));
const triggerServo = (token, payload) => unwrap(apiClient.post('/admin/servo-command', payload, withAuth(token)));

export {
  apiClient,
  getSlots,
  createBooking,
  getVoucher,
  getTransaction,
  payTransaction,
  adminLogin,
  getAdminOverview,
  resetSlot,
  triggerServo
};
