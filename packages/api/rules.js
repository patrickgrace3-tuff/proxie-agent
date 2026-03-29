import { client } from './client';

export const getRules = async () => {
  const res = await client.get('/api/rules/');
  return res.data;
};

export const saveRules = async (rules) => {
  const res = await client.post('/api/rules/save', rules);
  return res.data;
};

export const activateRules = async () => {
  const res = await client.post('/api/rules/activate');
  return res.data;
};