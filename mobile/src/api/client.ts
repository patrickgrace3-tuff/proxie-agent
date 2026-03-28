import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

export const client = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

let authToken: string | null = null;

export const setToken = (token: string | null) => {
  authToken = token;
  if (token) {
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete client.defaults.headers.common['Authorization'];
  }
};

export const getToken = () => authToken;