import { client } from './client';

export const getFeeds = async () => {
  const res = await client.get('/api/feeds/feeds');
  return res.data;
};

export const createFeed = async (feed) => {
  const res = await client.post('/api/feeds/feeds', feed);
  return res.data;
};

export const syncFeed = async (feedId) => {
  const res = await client.post(`/api/feeds/feeds/${feedId}/sync`);
  return res.data;
};

export const getFeedJobs = async (params = {}) => {
  const res = await client.get('/api/feeds/feeds/jobs', { params });
  return res.data;
};

export const queueFeedJob = async (jobId) => {
  const res = await client.post(`/api/feeds/feeds/jobs/${jobId}/queue`);
  return res.data;
};