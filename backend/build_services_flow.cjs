/**
 * Builds the WhatsApp "Choose Service" Flow JSON for EDMS (endpoint-driven).
 * Version 7.0 / Data API 3.0. Screens are populated at runtime by the flow
 * endpoint (banner/icons as base64, admin-managed copy, dynamic option lists).
 *
 * Screens:
 *  SERVICE_SELECT  — welcome banner + service menu (varies by user state)
 *  BENEFITS        — in-flow benefits content (admin copy)
 *  FAQ             — in-flow FAQ content (admin copy)
 *  SOCIAL_SELECT   — WhatsApp / Audio SMS / SMS Broadcast chooser
 *  WA_FORM         — WhatsApp broadcast request (audience + image upload + message)
 *  AUDIO_FORM      — Audio SMS request (audience + audio upload)
 *  SMS_FORM        — SMS broadcast request (audience + language + message)
 *  PURCHASE        — plan summary / "my plan" (pay via link sent to chat)
 *  INFO            — generic terminal (used while the endpoint sends a chat message)
 *
 * Demo / Website / Support / My Credentials / Register are handled by the
 * endpoint sending a chat message and returning the INFO screen (flow closes).
 */
const fs = require('fs');
const path = require('path');

// Registration screens (WELCOME…SUMMARY_SUBMIT) are embedded into this flow so
// the "Register" menu option runs the registration inside the same flow. They
// are taken verbatim from the live registration flow JSON.
let REG_SCREENS = [];
let REG_ROUTING = {};
try {
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, 'registration_flow_live.json'), 'utf8'));
  REG_SCREENS = reg.screens || [];
  REG_ROUTING = reg.routing_model || {};
} catch (e) {
  console.warn('WARNING: registration_flow_live.json not found — registration screens will be omitted.', e.message);
}

const optItem = { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } };
const svcItem = { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, image: { type: 'string' } } };

// Welcome/sub-screen banner — 8:1 ratio (1000x125), matching the reference
// project. scale-type 'cover' crops the uploaded image to fill the wide box.
const bannerImage = (srcKey, hasKey, alt) => ({
  type: 'Image',
  src: `\${data.${srcKey}}`,
  width: 1000,
  height: 125,
  'scale-type': 'cover',
  'alt-text': alt,
  visible: `\${data.${hasKey}}`,
});

const schema = {
  version: '7.0',
  data_api_version: '3.0',
  routing_model: {
    // SERVICE_SELECT can navigate to WELCOME (registration entry) too.
    SERVICE_SELECT: ['BENEFITS', 'FAQ', 'SOCIAL_SELECT', 'PURCHASE', 'INFO', 'WELCOME'],
    SOCIAL_SELECT: ['WA_FORM', 'AUDIO_FORM', 'SMS_FORM', 'INFO'],
    BENEFITS: [],
    FAQ: [],
    WA_FORM: [],
    AUDIO_FORM: [],
    SMS_FORM: [],
    PURCHASE: [],
    INFO: [],
    // Registration screen transitions (merged from the registration flow).
    ...REG_ROUTING,
  },
  screens: [
    /* ─── SERVICE_SELECT ─── */
    {
      id: 'SERVICE_SELECT',
      title: 'Choose Service',
      data: {
        welcome_banner: { type: 'string', __example__: 'iVBORw0KGgo' },
        has_welcome_banner: { type: 'boolean', __example__: false },
        menu_heading: { type: 'string', __example__: 'Select a service' },
        services: {
          type: 'array',
          items: svcItem,
          __example__: [
            { id: 'register', title: 'Register', description: 'Create your EDMS account' },
            { id: 'demo', title: 'Demo', description: 'Watch a quick demo' },
            { id: 'benefits', title: 'Benefits', description: 'Why EDMS' },
            { id: 'faq', title: 'FAQ', description: 'Common questions' },
            { id: 'website', title: 'Website', description: 'Visit our website' },
            { id: 'support', title: 'Support', description: 'Talk to our team' },
          ],
        },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          bannerImage('welcome_banner', 'has_welcome_banner', 'EDMS'),
          {
            type: 'RadioButtonsGroup',
            name: 'selected_service',
            label: '${data.menu_heading}',
            required: true,
            'data-source': '${data.services}',
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': { name: 'data_exchange', payload: { selected_service: '${form.selected_service}' } },
          },
        ],
      },
    },

    /* ─── BENEFITS (terminal) ─── */
    {
      id: 'BENEFITS',
      title: 'Benefits',
      terminal: true,
      success: true,
      data: {
        banner: { type: 'string', __example__: 'iVBORw0KGgo' },
        has_banner: { type: 'boolean', __example__: false },
        content: { type: 'string', __example__: 'EDMS benefits...' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          bannerImage('banner', 'has_banner', 'Benefits'),
          { type: 'TextHeading', text: 'Benefits of EDMS' },
          { type: 'TextBody', text: '${data.content}' },
          { type: 'Footer', label: 'Close', 'on-click-action': { name: 'complete', payload: {} } },
        ],
      },
    },

    /* ─── FAQ (terminal) ─── */
    {
      id: 'FAQ',
      title: 'FAQ',
      terminal: true,
      success: true,
      data: {
        banner: { type: 'string', __example__: 'iVBORw0KGgo' },
        has_banner: { type: 'boolean', __example__: false },
        content: { type: 'string', __example__: 'FAQ...' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          bannerImage('banner', 'has_banner', 'FAQ'),
          { type: 'TextHeading', text: 'Frequently Asked Questions' },
          { type: 'TextBody', text: '${data.content}' },
          { type: 'Footer', label: 'Close', 'on-click-action': { name: 'complete', payload: {} } },
        ],
      },
    },

    /* ─── SOCIAL_SELECT ─── */
    {
      id: 'SOCIAL_SELECT',
      title: 'Social Media Request',
      data: {
        banner: { type: 'string', __example__: 'iVBORw0KGgo' },
        has_banner: { type: 'boolean', __example__: false },
        channels: {
          type: 'array',
          items: svcItem,
          __example__: [
            { id: 'whatsapp', title: 'WhatsApp', description: 'WhatsApp broadcast' },
            { id: 'audio', title: 'Audio SMS', description: 'Voice call broadcast' },
            { id: 'sms', title: 'SMS Broadcast', description: 'Text SMS broadcast' },
          ],
        },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          bannerImage('banner', 'has_banner', 'Social Media Request'),
          { type: 'TextBody', text: 'Choose a channel for your broadcast request.' },
          {
            type: 'RadioButtonsGroup',
            name: 'social_channel',
            label: 'Select channel',
            required: true,
            'data-source': '${data.channels}',
          },
          {
            type: 'Footer',
            label: 'Continue',
            'on-click-action': { name: 'data_exchange', payload: { social_channel: '${form.social_channel}' } },
          },
        ],
      },
    },

    /* ─── WA_FORM (terminal) ─── */
    {
      id: 'WA_FORM',
      title: 'WhatsApp Request',
      terminal: true,
      success: true,
      data: {
        init_name: { type: 'string', __example__: 'Perivi' },
        init_phone: { type: 'string', __example__: '918106811285' },
        audience_options: { type: 'array', items: optItem, __example__: [{ id: 'all', title: 'All Voters' }] },
        booth_options: { type: 'array', items: optItem, __example__: [{ id: '', title: 'All Booths' }] },
        section_options: { type: 'array', items: optItem, __example__: [{ id: '', title: 'All Sections' }] },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'WhatsApp Broadcast Request' },
          { type: 'TextInput', name: 'req_name', label: 'Name', enabled: false, 'init-value': '${data.init_name}' },
          { type: 'TextInput', name: 'req_mobile', label: 'Mobile', 'input-type': 'phone', enabled: false, 'init-value': '${data.init_phone}' },
          { type: 'Dropdown', name: 'audience', label: 'Target Audience', required: true, 'data-source': '${data.audience_options}' },
          { type: 'Dropdown', name: 'booth', label: 'Booth', 'data-source': '${data.booth_options}' },
          { type: 'Dropdown', name: 'section', label: 'Section', 'data-source': '${data.section_options}' },
          { type: 'TextArea', name: 'content', label: 'WhatsApp message', required: true, 'helper-text': 'The message to broadcast.' },
          { type: 'DocumentPicker', name: 'document', label: 'Attach document', description: 'Upload an image or file to broadcast.', 'min-uploaded-documents': 0, 'max-uploaded-documents': 1 },
          {
            type: 'Footer',
            label: 'Submit Request',
            'on-click-action': {
              name: 'complete',
              payload: {
                kind: 'social_request', channel: 'whatsapp',
                req_name: '${form.req_name}', audience: '${form.audience}', booth: '${form.booth}', section: '${form.section}', content: '${form.content}', document: '${form.document}',
              },
            },
          },
        ],
      },
    },

    /* ─── AUDIO_FORM (terminal) ─── */
    {
      id: 'AUDIO_FORM',
      title: 'Audio SMS Request',
      terminal: true,
      success: true,
      data: {
        init_name: { type: 'string', __example__: 'Perivi' },
        init_phone: { type: 'string', __example__: '918106811285' },
        audience_options: { type: 'array', items: optItem, __example__: [{ id: 'all', title: 'All Voters' }] },
        booth_options: { type: 'array', items: optItem, __example__: [{ id: '', title: 'All Booths' }] },
        section_options: { type: 'array', items: optItem, __example__: [{ id: '', title: 'All Sections' }] },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'Audio SMS (Voice) Request' },
          { type: 'TextInput', name: 'req_name', label: 'Name', enabled: false, 'init-value': '${data.init_name}' },
          { type: 'TextInput', name: 'req_mobile', label: 'Mobile', 'input-type': 'phone', enabled: false, 'init-value': '${data.init_phone}' },
          { type: 'Dropdown', name: 'audience', label: 'Target Audience', required: true, 'data-source': '${data.audience_options}' },
          { type: 'Dropdown', name: 'booth', label: 'Booth', 'data-source': '${data.booth_options}' },
          { type: 'Dropdown', name: 'section', label: 'Section', 'data-source': '${data.section_options}' },
          { type: 'DocumentPicker', name: 'document', label: 'Upload audio file', description: 'Upload your audio (mp3) file to broadcast.', 'min-uploaded-documents': 1, 'max-uploaded-documents': 1 },
          {
            type: 'Footer',
            label: 'Submit Request',
            'on-click-action': {
              name: 'complete',
              payload: {
                kind: 'social_request', channel: 'audio',
                req_name: '${form.req_name}', audience: '${form.audience}', booth: '${form.booth}', section: '${form.section}', document: '${form.document}',
              },
            },
          },
        ],
      },
    },

    /* ─── SMS_FORM (terminal) ─── */
    {
      id: 'SMS_FORM',
      title: 'SMS Broadcast Request',
      terminal: true,
      success: true,
      data: {
        init_name: { type: 'string', __example__: 'Perivi' },
        init_phone: { type: 'string', __example__: '918106811285' },
        audience_options: { type: 'array', items: optItem, __example__: [{ id: 'all', title: 'All Voters' }] },
        booth_options: { type: 'array', items: optItem, __example__: [{ id: '', title: 'All Booths' }] },
        section_options: { type: 'array', items: optItem, __example__: [{ id: '', title: 'All Sections' }] },
        language_options: { type: 'array', items: optItem, __example__: [{ id: 'ta', title: 'Tamil' }, { id: 'en', title: 'English' }] },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: 'SMS Broadcast Request' },
          { type: 'TextInput', name: 'req_name', label: 'Name', enabled: false, 'init-value': '${data.init_name}' },
          { type: 'TextInput', name: 'req_mobile', label: 'Mobile', 'input-type': 'phone', enabled: false, 'init-value': '${data.init_phone}' },
          { type: 'Dropdown', name: 'audience', label: 'Target Audience', required: true, 'data-source': '${data.audience_options}' },
          { type: 'Dropdown', name: 'booth', label: 'Booth', 'data-source': '${data.booth_options}' },
          { type: 'Dropdown', name: 'section', label: 'Section', 'data-source': '${data.section_options}' },
          { type: 'Dropdown', name: 'language', label: 'Language', required: true, 'data-source': '${data.language_options}' },
          { type: 'TextArea', name: 'content', label: 'SMS message', required: true },
          {
            type: 'Footer',
            label: 'Submit Request',
            'on-click-action': {
              name: 'complete',
              payload: {
                kind: 'social_request', channel: 'sms',
                req_name: '${form.req_name}', audience: '${form.audience}', booth: '${form.booth}', section: '${form.section}', language: '${form.language}', content: '${form.content}',
              },
            },
          },
        ],
      },
    },

    /* ─── PURCHASE (terminal) ─── */
    {
      id: 'PURCHASE',
      title: 'Subscription',
      terminal: true,
      success: true,
      data: {
        banner: { type: 'string', __example__: 'iVBORw0KGgo' },
        has_banner: { type: 'boolean', __example__: false },
        plan_title: { type: 'string', __example__: 'Your EDMS Plan' },
        plan_text: { type: 'string', __example__: 'Booths: 10\nAmount: ₹23,600' },
        cta_label: { type: 'string', __example__: 'Pay Now' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          bannerImage('banner', 'has_banner', 'Subscription'),
          { type: 'TextHeading', text: '${data.plan_title}' },
          { type: 'TextBody', text: '${data.plan_text}' },
          {
            type: 'Footer',
            label: '${data.cta_label}',
            'on-click-action': { name: 'complete', payload: { kind: 'purchase' } },
          },
        ],
      },
    },

    /* ─── INFO (terminal) ─── */
    {
      id: 'INFO',
      title: 'EDMS',
      terminal: true,
      success: true,
      data: {
        info_title: { type: 'string', __example__: 'Done' },
        info_body: { type: 'string', __example__: 'Please check your chat.' },
        action: { type: 'string', __example__: '' },
      },
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading', text: '${data.info_title}' },
          { type: 'TextBody', text: '${data.info_body}' },
          { type: 'Footer', label: 'Close', 'on-click-action': { name: 'complete', payload: { kind: 'svc_info', action: '${data.action}' } } },
        ],
      },
    },
  ],
};

// Append the registration screens (WELCOME…SUMMARY_SUBMIT) so Register runs in-flow.
schema.screens.push(...REG_SCREENS);

fs.writeFileSync('services_flow_schema.json', JSON.stringify(schema, null, 2));
console.log('Saved services_flow_schema.json (' + schema.screens.length + ' screens, incl. ' + REG_SCREENS.length + ' registration screens).');
