// lib/fetcher.js
import axios from 'axios';

export const fetcher = async (url) => {
  const res = await axios.get(url);
  return res.data;
};