import { getAppDb } from '../config/db.js';
import { toObjectId } from '../utils/objectId.js';
import { ROLES } from '../constants/roles.js';
import { nextUserId } from '../models/userModel.js';

/**
 * GET /api/team/members — List all CRM team members with their live stats
 */
export async function listTeamMembers(req, res) {
  try {
    const db = getAppDb();
    
    // Fetch all CRM Team Members (user_group_id = 12)
    const members = await db
      .collection('tbl_user')
      .find({ user_group_id: ROLES.CRM_AGENT })
      .sort({ created_at: -1 })
      .toArray();

    // Aggregate stats per agent from tbl_crm_conversation & tbl_crm_message
    const conversations = await db.collection('tbl_crm_conversation').find({}).toArray();

    // Look up paid status for all conversation mobiles
    const mobiles = conversations.map((c) => c.clean_mobile).filter(Boolean);
    const [users, enquiries] = await Promise.all([
      db.collection('tbl_user').find({ mobile_no: { $in: mobiles } }).toArray(),
      db.collection('tbl_enquiry').find({ mobile: { $in: mobiles } }).toArray(),
    ]);

    const userByMobile = Object.fromEntries(users.map((u) => [u.mobile_no, u]));
    const enquiryByMobile = Object.fromEntries(enquiries.map((e) => [e.mobile, e]));

    const statsByAgent = {};
    for (const conv of conversations) {
      const agentId = conv.assigned_agent_id || conv.last_handled_by;
      if (!agentId) continue;

      if (!statsByAgent[agentId]) {
        statsByAgent[agentId] = {
          interested: 0,
          not_interested: 0,
          first_call_complete: 0,
          second_call_complete: 0,
          third_call_complete: 0,
          switch_off: 0,
          not_answered: 0,
          will_call_back: 0,
          calls_completed: 0,
          pro_users: 0,
          total_handled: 0,
        };
      }

      statsByAgent[agentId].total_handled += 1;
      const status = conv.lead_status;
      if (status === 'interested') statsByAgent[agentId].interested += 1;
      else if (status === 'not_interested') statsByAgent[agentId].not_interested += 1;
      else if (status === 'first_call_complete') {
        statsByAgent[agentId].first_call_complete += 1;
        statsByAgent[agentId].calls_completed += 1;
      } else if (status === 'second_call_complete') {
        statsByAgent[agentId].second_call_complete += 1;
        statsByAgent[agentId].calls_completed += 1;
      } else if (status === 'third_call_complete') {
        statsByAgent[agentId].third_call_complete += 1;
        statsByAgent[agentId].calls_completed += 1;
      } else if (status === 'switch_off') statsByAgent[agentId].switch_off += 1;
      else if (status === 'not_answered') statsByAgent[agentId].not_answered += 1;
      else if (status === 'will_call_back') statsByAgent[agentId].will_call_back += 1;
      else if (status === 'call_completed') statsByAgent[agentId].calls_completed += 1;

      // Dynamic Active Pro check: paid_status === 'Yes'
      const u = userByMobile[conv.clean_mobile];
      const e = enquiryByMobile[conv.clean_mobile];
      const paidStatus = u?.paid_status || e?.paid_status || 'No';
      if (String(paidStatus).toLowerCase() === 'yes') {
        statsByAgent[agentId].pro_users += 1;
      }
    }

    const defaultAgentStats = {
      interested: 0,
      not_interested: 0,
      first_call_complete: 0,
      second_call_complete: 0,
      third_call_complete: 0,
      switch_off: 0,
      not_answered: 0,
      will_call_back: 0,
      calls_completed: 0,
      pro_users: 0,
      total_handled: 0,
    };

    const enriched = members.map((m) => {
      const idStr = String(m._id);
      const username = m.user_name || m.mobile_no;
      const agentStats = statsByAgent[idStr] || statsByAgent[username] || { ...defaultAgentStats };

      return {
        id: idStr,
        user_id: m.id,
        name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.mobile_no || 'Team Member',
        username: m.user_name || m.mobile_no,
        mobile: m.mobile_no || '',
        password_str: m.password_str || '****',
        is_active: Number(m.is_active ?? 1) === 1,
        created_at: m.created_at || new Date(),
        last_login: m.updated_at || null,
        stats: agentStats,
      };
    });

    return res.json({
      success: true,
      members: enriched,
    });
  } catch (err) {
    console.error('[listTeamMembers Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list team members.' });
  }
}

/**
 * POST /api/team/members — Create new CRM Team Member credentials
 */
export async function createTeamMember(req, res) {
  try {
    const db = getAppDb();
    const { name, username, mobile, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ success: false, message: 'Name, Username, and Password are required.' });
    }

    const cleanUsername = String(username).trim();
    const cleanMobile = String(mobile || '').replace(/\D/g, '').slice(-10);

    // Check if username or mobile already exists
    const existing = await db.collection('tbl_user').findOne({
      $or: [
        { user_name: cleanUsername },
        ...(cleanMobile ? [{ mobile_no: cleanMobile }] : []),
      ],
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'A team member with this Username or Mobile number already exists.' });
    }

    const newId = await nextUserId();
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    const newMemberDoc = {
      id: newId,
      uuid: `crm_agent_${Date.now()}`,
      user_group_id: ROLES.CRM_AGENT,
      first_name: firstName,
      last_name: lastName,
      user_name: cleanUsername,
      mobile_no: cleanMobile || cleanUsername,
      email: `${cleanUsername}@edm.local`,
      password_str: String(password).trim(),
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await db.collection('tbl_user').insertOne(newMemberDoc);

    return res.json({
      success: true,
      message: `Team Member '${name}' created successfully! Credentials: Username=${cleanUsername}, Passcode=${password}`,
      member: {
        id: String(result.insertedId),
        name,
        username: cleanUsername,
        mobile: cleanMobile,
        password_str: String(password).trim(),
      },
    });
  } catch (err) {
    console.error('[createTeamMember Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create team member.' });
  }
}

/**
 * PUT /api/team/members/:id — Edit Team Member credentials or status
 */
export async function updateTeamMember(req, res) {
  try {
    const db = getAppDb();
    const { id } = req.params;
    const { name, username, mobile, password, is_active } = req.body;

    const oid = toObjectId(id);
    const existing = await db.collection('tbl_user').findOne({ _id: oid });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Team member not found.' });
    }

    const updateDoc = { updated_at: new Date().toISOString() };

    if (name) {
      const parts = name.trim().split(' ');
      updateDoc.first_name = parts[0];
      updateDoc.last_name = parts.slice(1).join(' ') || '';
    }
    if (username) updateDoc.user_name = String(username).trim();
    if (mobile) updateDoc.mobile_no = String(mobile).replace(/\D/g, '').slice(-10);
    if (password) updateDoc.password_str = String(password).trim();
    if (typeof is_active !== 'undefined') updateDoc.is_active = is_active ? 1 : 0;

    await db.collection('tbl_user').updateOne({ _id: oid }, { $set: updateDoc });

    return res.json({ success: true, message: 'Team member details updated successfully.' });
  } catch (err) {
    console.error('[updateTeamMember Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update team member.' });
  }
}

/**
 * DELETE /api/team/members/:id — Delete a team member
 */
export async function deleteTeamMember(req, res) {
  try {
    const db = getAppDb();
    const { id } = req.params;

    const oid = toObjectId(id);
    await db.collection('tbl_user').deleteOne({ _id: oid });

    return res.json({ success: true, message: 'Team member deleted successfully.' });
  } catch (err) {
    console.error('[deleteTeamMember Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete team member.' });
  }
}

/**
 * GET /api/team/stats — Overview of all CRM Lead Stats (Interested, Not Interested, Calls Completed, Pro Users)
 */
export async function getTeamStats(req, res) {
  try {
    const db = getAppDb();

    const conversations = await db.collection('tbl_crm_conversation').find({}).toArray();
    const members = await db.collection('tbl_user').find({ user_group_id: ROLES.CRM_AGENT }).toArray();

    // Look up paid_status for all conversation mobiles
    const mobiles = conversations.map((c) => c.clean_mobile).filter(Boolean);
    const [users, enquiries] = await Promise.all([
      db.collection('tbl_user').find({ mobile_no: { $in: mobiles } }).toArray(),
      db.collection('tbl_enquiry').find({ mobile: { $in: mobiles } }).toArray(),
    ]);

    const userByMobile = Object.fromEntries(users.map((u) => [u.mobile_no, u]));
    const enquiryByMobile = Object.fromEntries(enquiries.map((e) => [e.mobile, e]));

    let interested = 0;
    let not_interested = 0;
    let first_call_complete = 0;
    let second_call_complete = 0;
    let third_call_complete = 0;
    let switch_off = 0;
    let not_answered = 0;
    let will_call_back = 0;
    let calls_completed = 0;
    let pro_users = 0;

    for (const conv of conversations) {
      const s = conv.lead_status;
      if (s === 'interested') interested += 1;
      else if (s === 'not_interested') not_interested += 1;
      else if (s === 'first_call_complete') {
        first_call_complete += 1;
        calls_completed += 1;
      } else if (s === 'second_call_complete') {
        second_call_complete += 1;
        calls_completed += 1;
      } else if (s === 'third_call_complete') {
        third_call_complete += 1;
        calls_completed += 1;
      } else if (s === 'switch_off') switch_off += 1;
      else if (s === 'not_answered') not_answered += 1;
      else if (s === 'will_call_back') will_call_back += 1;
      else if (s === 'call_completed') calls_completed += 1;

      // Dynamic Active Pro Users check: paid_status === 'Yes'
      const u = userByMobile[conv.clean_mobile];
      const e = enquiryByMobile[conv.clean_mobile];
      const paidStatus = u?.paid_status || e?.paid_status || 'No';
      if (String(paidStatus).toLowerCase() === 'yes') {
        pro_users += 1;
      }
    }

    return res.json({
      success: true,
      stats: {
        total_leads: conversations.length,
        interested,
        not_interested,
        first_call_complete,
        second_call_complete,
        third_call_complete,
        switch_off,
        not_answered,
        will_call_back,
        calls_completed,
        pro_users,
        total_team_members: members.length,
      },
    });
  } catch (err) {
    console.error('[getTeamStats Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch team stats.' });
  }
}
