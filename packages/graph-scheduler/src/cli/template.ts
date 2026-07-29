import type { SchedulerConfig } from '../schemas/index.js';

/** default config.json template — values aligned with resolveConfig() defaults */
export const DEFAULT_CONFIG: SchedulerConfig = {
  dbPath: '.graph-scheduler/data/graph-scheduler.db',
  taskflowDir: '.graph-scheduler/graphs',
  registryPaths: ['.graph-scheduler/graphs/registry.json'],
};
