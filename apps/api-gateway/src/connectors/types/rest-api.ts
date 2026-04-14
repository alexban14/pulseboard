import type { ConnectorType } from '@pulseboard/shared-types';

export const restApiConnectorType: ConnectorType = {
  id: 'rest-api',
  name: 'REST API',
  category: 'api',
  icon: 'globe',
  description: 'Connect to any REST API endpoint',
  configFields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      required: true,
      placeholder: 'https://api.example.com/v1',
    },
    {
      key: 'authType',
      label: 'Authentication',
      type: 'select',
      required: true,
      default: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'API Key (Header)', value: 'api_key' },
        { label: 'Bearer Token', value: 'bearer' },
        { label: 'Basic Auth', value: 'basic' },
      ],
    },
    {
      key: 'apiKey',
      label: 'API Key / Token',
      type: 'password',
      required: false,
      helpText: 'API key, bearer token, or password depending on auth type',
    },
    {
      key: 'apiKeyHeader',
      label: 'API Key Header Name',
      type: 'text',
      required: false,
      default: 'Authorization',
      helpText: 'Header name for API key auth (e.g., X-API-Key)',
    },
    {
      key: 'username',
      label: 'Username',
      type: 'text',
      required: false,
      helpText: 'For Basic Auth only',
    },
  ],
  capabilities: {
    schemaDiscovery: true,
    incrementalSync: true,
    fullRefresh: true,
    webhookIngestion: false,
  },
};
