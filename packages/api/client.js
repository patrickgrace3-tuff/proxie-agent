import axios from 'axios';

const API_URL = import.meta.env?.VITE_API_URL 
  || process.env?.EXPO_PUBLIC_API_URL 
  || 'https://proxie-agent-api.onrender.com';

export const client = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

export const setToken = (token) => {
  if (token) {
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage?.setItem?.('DA_TOKEN', token);
  } else {
    delete client.defaults.headers.common['Authorization'];
    localStorage?.removeItem?.('DA_TOKEN');
  }
};

export const loadToken = () => {
  const token = localStorage?.getItem?.('DA_TOKEN');
  if (token) setToken(token);
  return token;
};