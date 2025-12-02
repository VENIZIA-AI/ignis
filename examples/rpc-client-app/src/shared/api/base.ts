import createClient from 'openapi-react-query';
import { fetchClient } from './client';

export const $api = createClient(fetchClient);
