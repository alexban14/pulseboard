import type { ConnectorType } from '@pulseboard/shared-types';

export const csvConnectorType: ConnectorType = {
  id: 'csv',
  name: 'CSV / Excel Upload',
  category: 'file',
  icon: 'file-spreadsheet',
  description: 'Upload CSV or Excel files as a data source',
  configFields: [
    {
      key: 'delimiter',
      label: 'Delimiter',
      type: 'select',
      required: false,
      default: ',',
      options: [
        { label: 'Comma (,)', value: ',' },
        { label: 'Semicolon (;)', value: ';' },
        { label: 'Tab', value: '\t' },
        { label: 'Pipe (|)', value: '|' },
      ],
      helpText: 'Column separator (auto-detected for Excel files)',
    },
    {
      key: 'hasHeader',
      label: 'First row is header',
      type: 'boolean',
      required: false,
      default: true,
    },
  ],
  capabilities: {
    schemaDiscovery: true,
    incrementalSync: false,
    fullRefresh: true,
    webhookIngestion: false,
  },
};
