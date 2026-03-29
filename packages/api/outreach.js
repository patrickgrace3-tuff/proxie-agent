import { client } from './client';

export const getOutreachLog = async () => {
  const res = await client.get('/api/carriers/outreach-log');
  return res.data;
};

export const updateOutreachStatus = async (id, status) => {
  const res = await client.post(`/api/carriers/outreach/${id}/status`, { status });
  return res.data;
};