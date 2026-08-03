import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authRequired } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as voters from '../controllers/voterController.js';
import * as assemblies from '../controllers/assemblyController.js';
import * as booths from '../controllers/boothController.js';
import * as users from '../controllers/userController.js';
import * as mla from '../controllers/mlaController.js';
import * as boothLogins from '../controllers/boothLoginController.js';
import * as wardLogins from '../controllers/wardLoginController.js';
import * as registrations from '../controllers/registrationController.js';
import * as payments from '../controllers/paymentController.js';
import * as reports from '../controllers/reportController.js';
import * as cms from '../controllers/cmsController.js';
import * as messaging from '../controllers/messagingController.js';
import * as survey from '../controllers/surveyController.js';
import * as flowImages from '../controllers/flowImageController.js';
import * as ward from '../controllers/wardController.js';
import * as whatsapp from '../controllers/whatsappController.js';
import * as crm from '../controllers/crmController.js';
import * as team from '../controllers/teamController.js';
import * as templates from '../controllers/templateController.js';

const r = Router();

// Throttle credential endpoints to blunt brute-force / credential-stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

// ---- Public ----
r.post('/auth/login', authLimiter, auth.login);
r.post('/auth/register', authLimiter, auth.register);
r.post('/payments/webhook', payments.razorpayWebhook);

// WhatsApp Meta Webhook & Flow Endpoints (Public)
r.get('/whatsapp/webhook', whatsapp.webhookVerification);
r.post('/whatsapp/webhook', whatsapp.webhookHandler);
r.get('/whatsapp-webhook', whatsapp.webhookVerification);
r.post('/whatsapp-webhook', whatsapp.webhookHandler);
r.post('/whatsapp-flow-endpoint', whatsapp.flowEndpoint);

// Public Assembly & Booth Lookup for Registration
r.get('/public/assemblies', assemblies.list);
r.get('/public/booths', booths.boothsByAssembly);

// ---- Protected (mirrors Laravel `adminauth` group) ----
r.use(authRequired);
r.get('/auth/me', auth.me);
r.post('/auth/refresh', auth.refresh);
r.post('/auth/logout', auth.logout);

// CRM Inbox & WhatsApp Messaging
r.get('/crm/conversations', crm.listConversations);
r.get('/crm/agents', crm.listAgents);
r.post('/crm/distribute-leads', crm.distributeLeads);
r.get('/crm/conversations/:phone', crm.getConversationHistory);
r.post('/crm/conversations/:phone/status', crm.updateStatus);
r.post('/crm/conversations/:phone/lead-status', crm.updateLeadStatus);
r.post('/crm/conversations/:phone/notes', crm.updateLeadNotes);
r.post('/crm/conversations/:phone/assign', crm.assignConversation);
r.post('/crm/conversations/:phone/send-media', crm.sendMedia);
r.post('/crm/conversations/:phone/react', crm.reactToMessage);
r.delete('/crm/conversations/:phone/clear', crm.clearChat);
r.post('/crm/messages/send', crm.sendMessage);
r.post('/crm/send-credentials', crm.sendCredentials);
r.post('/crm/send-flow', crm.sendFlow);

// WhatsApp Message Templates (create / list / status / send)
r.get('/crm/team-stats', crm.teamStats);
r.get('/crm/team-report', crm.teamReport);
r.get('/crm/templates', templates.list);
r.post('/crm/templates', templates.create);
r.post('/crm/templates/setup-defaults', templates.setupDefaults);
r.post('/crm/conversations/:phone/send-template', templates.sendToContact);

// CRM Team Management & Stats
r.get('/team/members', team.listTeamMembers);
r.post('/team/members', team.createTeamMember);
r.put('/team/members/:id', team.updateTeamMember);
r.delete('/team/members/:id', team.deleteTeamMember);
r.get('/team/stats', team.getTeamStats);

// Dashboard
r.get('/dashboard/stats', dashboard.stats);
r.get('/dashboard/search-epic', dashboard.searchEpic);

// Voters
r.get('/voters', voters.list);
r.get('/voters/export', voters.exportCsv);
r.post('/voters/update-mobile', voters.updateMobile);
r.get('/voters/detail', voters.detail);

// Assemblies
r.get('/assemblies', assemblies.list);
r.get('/assemblies/:no', assemblies.detail);
r.put('/assemblies/:no', assemblies.update);

// Booths
r.get('/booths', booths.boothsByAssembly);

// Per-assembly MLA credentials (used by the Assembly List page)
r.get('/assembly-credentials', users.assemblyCredentials);
r.post('/assembly-credentials/:no/generate', users.generateCredentials);

// MLA images — profile photos (per constituency) + party flags (per party)
r.get('/mla/images', mla.list);
r.post('/mla/profile-upload', mla.uploadProfile);
r.post('/mla/flag-upload', mla.uploadFlag);
r.delete('/mla/profile/:no', mla.removeProfile);
r.delete('/mla/flag/:party', mla.removeFlag);

// Assembly-wise / Booth-wise login generation (mirrors AssemblyController)
r.get('/booth-logins', boothLogins.list);
r.post('/booth-logins/generate', boothLogins.generate);

// Ward-wise logins (mirrors UserManagementController@wardLogins*)
r.get('/ward-logins', wardLogins.list);
r.post('/ward-logins', wardLogins.store);
r.post('/ward-logins/:id/add-booth', wardLogins.addBooth);
r.post('/ward-logins/:id/delete-booth', wardLogins.deleteBooth);
r.post('/ward-logins/:id/save-booths', wardLogins.saveBooths);
r.post('/ward-logins/check-exists', wardLogins.checkExists);
r.delete('/ward-logins/:id', wardLogins.remove);

// Registrations, Payments/Subscriptions, Reports
r.get('/registrations', registrations.list);
r.get('/registrations/:id', registrations.detail);
r.put('/registrations/:id', registrations.update);
r.get('/payments/subscriptions', payments.subscriptions);
r.get('/payments/ledger', payments.payments);
r.get('/payments/ward-pricing', payments.getWardPricingApi);
r.post('/payments/order', payments.createOrder);
r.post('/payments/ward-order', payments.createWardOrder);
r.post('/payments/verify-ward-payment', payments.verifyWardPayment);
r.get('/payments/check-paid', payments.checkPaid);
r.post('/payments/check-order-status', payments.checkOrderStatus);
r.get('/reports/booth', reports.boothReport);
r.get('/reports/documents', reports.documents);
r.get('/reports/booth-report-list', reports.boothReportList);
r.get('/reports/assembly-analytics', reports.assemblyAnalyticsReport);

// Phase 5 — Mobile-app CMS (generic CRUD over 13 content collections)
r.get('/mobileapp/types', cms.types);
r.get('/mobileapp/:type', cms.list);
r.post('/mobileapp/:type', cms.create);
r.get('/mobileapp/:type/:id', cms.get);
r.put('/mobileapp/:type/:id', cms.update);
r.delete('/mobileapp/:type/:id', cms.remove);

// Messaging reports — used by the Ward "Social Media Reports" page (tbl_sms_report).
r.get('/messaging/reports', messaging.reports);

r.get('/survey', survey.list);
r.post('/survey', survey.create);
r.put('/survey/:id', survey.update);
r.delete('/survey/:id', survey.remove);

r.get('/flow-images', flowImages.list);
r.get('/flow-images/messages', flowImages.getMessages);
r.post('/flow-images/messages', flowImages.saveMessages);
r.post('/flow-images/upload', flowImages.upload);
r.delete('/flow-images/:id', flowImages.remove);

// Ward-wise login home (sample/preview vs assigned booths) + social-media requests
r.get('/ward/home', ward.home);
r.get('/ward/sample-voters', ward.sampleVoters);
r.get('/ward/social-media', ward.socialMedia);
r.get('/ward/social-media/booth-sections', ward.boothSections);
r.post('/ward/social-media/request', ward.socialMediaRequest);

export default r;
