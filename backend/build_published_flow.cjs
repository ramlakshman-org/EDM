const fs = require('fs');

const districtList = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
  'Dindigul', 'Erode', 'Kanchipuram', 'Kanyakumari', 'Karur', 'Krishnagiri',
  'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur',
  'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
  'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur',
  'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram',
  'Virudhunagar'
];

const assemblyList = [
  { id: 'Chennai Central', title: 'Chennai Central' },
  { id: 'Thiruvottiyur', title: '10 - Thiruvottiyur' },
  { id: 'Madavaram', title: '9 - Madavaram' },
  { id: 'Ambattur', title: '8 - Ambattur' },
  { id: 'Royapuram', title: '17 - Royapuram' },
  { id: 'Harbour', title: '18 - Harbour' },
  { id: 'Chepauk-Triplicane', title: '19 - Chepauk-Triplicane' },
  { id: 'Thousand Lights', title: '20 - Thousand Lights' },
  { id: 'Anna Nagar', title: '21 - Anna Nagar' },
  { id: 'Velachery', title: '26 - Velachery' },
  { id: 'Mylapore', title: '25 - Mylapore' },
  { id: 'Saidapet', title: '23 - Saidapet' },
  { id: 'Chengalpattu', title: '32 - Chengalpattu' },
  { id: 'Tambaram', title: '31 - Tambaram' },
  { id: 'Kanchipuram', title: '37 - Kanchipuram' },
  { id: 'Coimbatore South', title: '120 - Coimbatore South' },
  { id: 'Coimbatore North', title: '118 - Coimbatore North' },
  { id: 'Madurai Central', title: '192 - Madurai Central' },
  { id: 'Salem North', title: '89 - Salem North' },
  { id: 'Tiruchirappalli West', title: '140 - Tiruchirappalli West' },
  { id: 'Tirunelveli', title: '224 - Tirunelveli' },
  { id: 'Perambalur', title: '147 - Perambalur' },
  { id: 'General Assembly', title: 'Other Assembly Constituency' }
];

const boothList = [
  { id: 'All Booths', title: 'All Booths in Constituency' },
  ...Array.from({ length: 30 }, (_, i) => ({ id: `Booth ${i + 1}`, title: `Booth Number ${i + 1}` }))
];

const flowSchema = {
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
            label: 'Political Affiliation',
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
              name: 'navigate',
              next: {
                type: 'screen',
                name: 'PARTY_SELECT'
              },
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
        affiliation: { type: 'string', __example__: 'affiliated' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'RadioButtonsGroup',
            name: 'party',
            label: 'Select Party',
            required: true,
            'data-source': [
              { id: 'BJP', title: 'BJP (Bharatiya Janata Party)' },
              { id: 'DMK', title: 'DMK' },
              { id: 'AIADMK', title: 'AIADMK' },
              { id: 'INC', title: 'INC (Congress)' },
              { id: 'NTK', title: 'Naam Tamilar Katchi (NTK)' },
              { id: 'PMK', title: 'PMK' },
              { id: 'VCK', title: 'VCK' },
              { id: 'TVK', title: 'TVK (Tamilaga Vettri Kazhagam)' },
              { id: 'Independent', title: 'Independent' },
              { id: 'Other', title: 'Other Party' }
            ]
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'navigate',
              next: {
                type: 'screen',
                name: 'LOCAL_BODY_SELECT'
              },
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
              name: 'navigate',
              next: {
                type: 'screen',
                name: 'POSITION_SELECT'
              },
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
        body_type: { type: 'string', __example__: 'urban' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'position',
            label: 'Position Contesting',
            required: true,
            'data-source': [
              { id: 'Corporation', title: 'Corporation Councillor' },
              { id: 'Municipality', title: 'Municipality Chairman / Ward Member' },
              { id: 'TownPanchayat', title: 'Town Panchayat President / Ward' },
              { id: 'Mayor', title: 'Mayor / Deputy Mayor' },
              { id: 'VillagePanchayat', title: 'Village Panchayat President' },
              { id: 'PanchayatUnion', title: 'Panchayat Union Ward Member' },
              { id: 'DistrictPanchayat', title: 'District Panchayat Ward Member' }
            ]
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'navigate',
              next: {
                type: 'screen',
                name: 'DISTRICT_SELECT'
              },
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
        position: { type: 'string', __example__: 'Corporation' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'district',
            label: 'Select District',
            required: true,
            'data-source': districtList.map((d) => ({ id: d, title: d }))
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'navigate',
              next: {
                type: 'screen',
                name: 'ASSEMBLY_SELECT'
              },
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
      title: 'Select Assembly Constituency',
      terminal: false,
      data: {
        full_name: { type: 'string', __example__: 'John Doe' },
        role: { type: 'string', __example__: 'planning' },
        affiliation: { type: 'string', __example__: 'independent' },
        party: { type: 'string', __example__: 'Independent' },
        body_type: { type: 'string', __example__: 'urban' },
        position: { type: 'string', __example__: 'Corporation' },
        district: { type: 'string', __example__: 'Chennai' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'assembly_name',
            label: 'Select Assembly Constituency',
            required: true,
            'data-source': assemblyList
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'navigate',
              next: {
                type: 'screen',
                name: 'BOOTH_SELECT'
              },
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
        assembly_name: { type: 'string', __example__: 'Thiruvottiyur' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Dropdown',
            name: 'booth_number',
            label: 'Select Booth Number',
            required: true,
            'data-source': boothList
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': {
              name: 'navigate',
              next: {
                type: 'screen',
                name: 'SUMMARY_SUBMIT'
              },
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
        assembly_name: { type: 'string', __example__: 'Thiruvottiyur' },
        booth_number: { type: 'string', __example__: '1' }
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'Registration Summary' },
          { type: 'TextBody', text: 'Please review your registration details above and tap Submit Registration to complete your account setup.' },
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

fs.writeFileSync('flow_published_schema.json', JSON.stringify(flowSchema, null, 2));
console.log('Saved flow_published_schema.json successfully!');
