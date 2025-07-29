import axios from 'axios';
import z from 'zod';
import config from './config.js';

export const DrandResponse = z.object({
  round: z.number().int(),
  randomness: z.string(),
  signature: z.string(),
  previous_signature: z.string(),
});

export type DrandResponse = z.infer<typeof DrandResponse>;

export async function fetchRandomValue() {
  const response = await axios.get(config.drandApiUrl);
  return DrandResponse.parse(response.data);
}
