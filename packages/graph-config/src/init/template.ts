import type { ConfigFile } from '../schema/types';

// default config.json template — values match ConfigFileSchema .default()
export const DEFAULT_CONFIG: ConfigFile = {
  dbPath: '.graph-scheduler/data/graph-scheduler.db',
  taskflowDir: '.graph-scheduler/graphs',
  registryPaths: ['.graph-scheduler/graphs/registry.json'],
};
