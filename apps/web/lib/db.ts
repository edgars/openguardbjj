import 'server-only';
import { attachDatabasePool } from '@vercel/functions';
import { onPoolCreated } from '@bjj/core/db';

// Em Fluid Compute, libera conexões ociosas antes da instância ser suspensa.
onPoolCreated((pool) => attachDatabasePool(pool));

export { query, queryOne, withTransaction } from '@bjj/core/db';
