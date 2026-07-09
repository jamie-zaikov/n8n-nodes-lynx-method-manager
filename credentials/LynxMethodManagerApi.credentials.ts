import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class LynxMethodManagerApi implements ICredentialType {
  name = 'lynxMethodManagerApi';
  displayName = 'Lynx Method Manager API';
  documentationUrl =
    'https://github.com/jamie-zaikov/method-manager-rest-api';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'http://lm001.lab.example.com:8000',
      description:
        'The HTTP base URL of the target Method Manager REST API server (no trailing slash).',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      default: '',
      required: true,
      typeOptions: { password: true },
      description:
        'The X-API-Key value for this instrument. Stored encrypted; never exported in workflow JSON.',
    },
  ];
}
