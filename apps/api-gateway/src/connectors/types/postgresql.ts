import type { ConnectorType } from '@pulseboard/shared-types';

export const postgresqlConnectorType: ConnectorType = {
  id: 'postgresql',
  name: 'PostgreSQL',
  category: 'database',
  icon: 'postgresql',
  description: 'Connect to any PostgreSQL database',
  configFields: [
    {
      key: 'host',
      label: 'Host',
      type: 'text',
      required: true,
      placeholder: 'db.example.com',
      helpText: 'Database server hostname or IP address',
    },
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      required: true,
      default: 5432,
    },
    {
      key: 'database',
      label: 'Database',
      type: 'text',
      required: true,
      placeholder: 'my_database',
    },
    {
      key: 'schema',
      label: 'Schema',
      type: 'text',
      required: false,
      default: 'public',
      helpText: 'PostgreSQL schema to introspect (default: public)',
    },
    {
      key: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      placeholder: 'readonly_user',
    },
    {
      key: 'password',
      label: 'Password',
      type: 'password',
      required: true,
    },
    {
      key: 'ssl',
      label: 'Use SSL',
      type: 'boolean',
      required: false,
      default: false,
      helpText: 'Enable TLS/SSL encryption for the connection',
    },
  ],
  capabilities: {
    schemaDiscovery: true,
    incrementalSync: true,
    fullRefresh: true,
    webhookIngestion: false,
  },
};
