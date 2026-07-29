const fs = require('fs');

const dynamicSchema = {
  version: '7.0',
  data_api_version: '3.0',
  routing_model: {
    WELCOME: ['PARTY_SELECT', 'LOCAL_BODY_SELECT'],
    PARTY_SELECT: ['LOCAL_BODY_SELECT'],
    LOCAL_BODY_SELECT: ['POSITION_SELECT'],
    POSITION_SELECT: ['DISTRICT_SELECT'],
    DISTRICT_SELECT: ['ASSEMBLY_SELECT'],
    ASSEMBLY_SELECT: ['BOOTH_SELECT'],
    BOOTH_SELECT: ['SUMMARY_SUBMIT'],
    SUMMARY_SUBMIT: []
  },
  screens: [
    {
      id: 'WELCOME',
      title: 'Candidate Registration',
      terminal: false,
      data: {},
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextInput', name: 'full_name', label: 'Full Name', required: true },
          {
            type: 'Dropdown',
            name: 'role',
            label: 'Your Role / Status',
            required: true,
            'data-source': [
              { id: 'planning', title: 'Planning to Contest' },
              { id: 'confirmed', title: 'Confirmed Candidate' },
              { id: 'team', title: 'Campaign Team Member' },
              { id: 'functionary', title: 'Party Functionary' }
            ]
          },
          {
            type: 'Dropdown',
            name: 'affiliation',
            label: 'Party Affiliation',
            required: true,
            'data-source': [
              { id: 'affiliated', title: 'Affiliated with a party' },
              { id: 'independent', title: 'Independent' }
            ]
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'data_exchange',
              payload: {
                full_name: '${form.full_name}',
                role: '${form.role}',
                affiliation: '${form.affiliation}'
              }
            }
          }
        ]
      }
    },
    {
      id: 'PARTY_SELECT',
      title: 'Choose Party',
      terminal: false,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'affiliated' },
        party_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } }
          },
          __example__: [{ id: 'BJP', title: 'BJP' }]
        }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'RadioButtonsGroup',
            name: 'party',
            label: 'Select Party',
            required: true,
            'data-source': '${data.party_options}'
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'data_exchange',
              payload: {
                full_name: '${data.full_name}',
                role: '${data.role}',
                affiliation: '${data.affiliation}',
                party: '${form.party}'
              }
            }
          }
        ]
      }
    },
    {
      id: 'LOCAL_BODY_SELECT',
      title: 'Local Body Type',
      terminal: false,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'independent' },
        party: { type: 'string', __example__: 'Independent' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'body_type',
            label: 'Local Body Type',
            required: true,
            'data-source': [
              { id: 'rural', title: 'Rural Local Body (Panchayats)' },
              { id: 'urban', title: 'Urban Local Body (Municipal/Corp)' }
            ]
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'data_exchange',
              payload: {
                full_name: '${data.full_name}',
                role: '${data.role}',
                affiliation: '${data.affiliation}',
                party: '${data.party}',
                body_type: '${form.body_type}'
              }
            }
          }
        ]
      }
    },
    {
      id: 'POSITION_SELECT',
      title: 'Select Position',
      terminal: false,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'independent' },
        party: { type: 'string', __example__: 'Independent' },
        body_type: { type: 'string', __example__: 'urban' },
        position_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } }
          },
          __example__: [{ id: 'Corporation', title: 'Corporation Councillor' }]
        }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'position',
            label: 'Position Contesting',
            required: true,
            'data-source': '${data.position_options}'
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'data_exchange',
              payload: {
                full_name: '${data.full_name}',
                role: '${data.role}',
                affiliation: '${data.affiliation}',
                party: '${data.party}',
                body_type: '${data.body_type}',
                position: '${form.position}'
              }
            }
          }
        ]
      }
    },
    {
      id: 'DISTRICT_SELECT',
      title: 'Select District',
      terminal: false,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'independent' },
        party: { type: 'string', __example__: 'Independent' },
        body_type: { type: 'string', __example__: 'urban' },
        position: { type: 'string', __example__: 'Corporation' },
        district_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } }
          },
          __example__: [{ id: 'Chennai', title: 'Chennai' }]
        }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'district',
            label: 'Select District',
            required: true,
            'data-source': '${data.district_options}'
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'data_exchange',
              payload: {
                full_name: '${data.full_name}',
                role: '${data.role}',
                affiliation: '${data.affiliation}',
                party: '${data.party}',
                body_type: '${data.body_type}',
                position: '${data.position}',
                district: '${form.district}'
              }
            }
          }
        ]
      }
    },
    {
      id: 'ASSEMBLY_SELECT',
      title: 'Select Assembly',
      terminal: false,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'independent' },
        party: { type: 'string', __example__: 'Independent' },
        body_type: { type: 'string', __example__: 'urban' },
        position: { type: 'string', __example__: 'Corporation' },
        district: { type: 'string', __example__: 'Chennai' },
        assembly_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } }
          },
          __example__: [{ id: '10', title: '10 - Thiruvottiyur' }]
        }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'assembly_name',
            label: 'Select Assembly',
            required: true,
            'data-source': '${data.assembly_options}'
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'data_exchange',
              payload: {
                full_name: '${data.full_name}',
                role: '${data.role}',
                affiliation: '${data.affiliation}',
                party: '${data.party}',
                body_type: '${data.body_type}',
                position: '${data.position}',
                district: '${data.district}',
                assembly_name: '${form.assembly_name}'
              }
            }
          }
        ]
      }
    },
    {
      id: 'BOOTH_SELECT',
      title: 'Select Booth Number',
      terminal: false,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'independent' },
        party: { type: 'string', __example__: 'Independent' },
        body_type: { type: 'string', __example__: 'urban' },
        position: { type: 'string', __example__: 'Corporation' },
        district: { type: 'string', __example__: 'Chennai' },
        assembly_name: { type: 'string', __example__: '10 - Thiruvottiyur' },
        booth_options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } }
          },
          __example__: [{ id: '1', title: 'Booth 1' }]
        }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'booth_number',
            label: 'Select Booth Number',
            required: true,
            'data-source': '${data.booth_options}'
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'data_exchange',
              payload: {
                full_name: '${data.full_name}',
                role: '${data.role}',
                affiliation: '${data.affiliation}',
                party: '${data.party}',
                body_type: '${data.body_type}',
                position: '${data.position}',
                district: '${data.district}',
                assembly_name: '${data.assembly_name}',
                booth_number: '${form.booth_number}'
              }
            }
          }
        ]
      }
    },
    {
      id: 'SUMMARY_SUBMIT',
      title: 'Confirm & Register',
      terminal: true,
      success: true,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'independent' },
        party: { type: 'string', __example__: 'Independent' },
        body_type: { type: 'string', __example__: 'urban' },
        position: { type: 'string', __example__: 'Corporation' },
        district: { type: 'string', __example__: 'Chennai' },
        assembly_name: { type: 'string', __example__: '10 - Thiruvottiyur' },
        booth_number: { type: 'string', __example__: '1' },
        summary_text: { type: 'string', __example__: 'Name: John Doe\nDistrict: Chennai' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'Registration Summary' },
          { type: 'TextBody', text: '${data.summary_text}' },
          {
            type: 'Footer',
            label: 'Submit Registration',
            'on-click-action': {
              name: 'complete',
              payload: {
                full_name: '${data.full_name}',
                role: '${data.role}',
                affiliation: '${data.affiliation}',
                party: '${data.party}',
                body_type: '${data.body_type}',
                position: '${data.position}',
                district: '${data.district}',
                assembly_name: '${data.assembly_name}',
                booth_number: '${data.booth_number}'
              }
            }
          }
        ]
      }
    }
  ]
};

fs.writeFileSync('flow_schema.json', JSON.stringify(dynamicSchema, null, 2));
console.log('Restored dynamic data_exchange flow_schema.json successfully!');
