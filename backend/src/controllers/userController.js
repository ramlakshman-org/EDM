import bcrypt from 'bcryptjs';
import { getAppDb } from '../config/db.js';
import {
  listUsers, insertUser, updateUser, deleteUser, nextUserId, blankUser,
} from '../models/userModel.js';
import { ROLE_NAME } from '../constants/roles.js';

// Mirrors UserManagementController@List
export async function list(req, res) {
  try {
    const users = await listUsers({
      search: req.query.search || '',
      groupId: req.query.group_id ?? null,
      assemblyId: req.query.assembly_id ?? null,
    });
    res.json({
      success: true,
      users: users.map((u) => ({
        _id: u._id, id: u.id, name: u.first_name, mobile_no: u.mobile_no, email: u.email,
        group_id: u.user_group_id, role: ROLE_NAME[u.user_group_id] || 'User',
        assembly_id: u.assembly_id, booth_id: u.booth_id, ward_id: u.ward_id,
        paid_status: u.paid_status, is_active: u.is_active,
      })),
    });
  } catch (e) {
    res.status(503).json({ success: false, message: 'App database unavailable.' });
  }
}

// Mirrors UserManagementController@form (create)
export async function create(req, res) {
  try {
    const b = req.body || {};
    const passcode = b.password_str || b.password || String(Math.floor(100000 + Math.random() * 900000));
    const id = await nextUserId();
    const doc = {
      ...blankUser(),
      id,
      user_group_id: parseInt(b.group_id || 0, 10),
      first_name: b.name || '',
      last_name: b.last_name || '',
      email: b.email || '',
      mobile_no: b.mobile_no || '',
      parliament_id: b.parliament_id || '',
      assembly_id: b.assembly_id ? parseInt(b.assembly_id, 10) : 0,
      assembly_no: b.assembly_id ? parseInt(b.assembly_id, 10) : 0,
      booth_id: b.booth_id || '',
      ward_id: b.ward_id || '',
      candidate_party: b.candidate_party || '',
      candidate_type: b.candidate_type || '',
      position: b.position || '',
      paid_status: b.paid_status || 'No',
      password: await bcrypt.hash(passcode, 10),
      password_str: passcode,
      is_active: 1,
    };
    const user = await insertUser(doc);
    res.json({ success: true, user: { _id: user._id, mobile_no: user.mobile_no, passcode } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// Whitelist of fields a normal update may modify — prevents mass-assignment
// privilege escalation (e.g. a client sending user_group_id: 1).
const USER_UPDATABLE_FIELDS = [
  'first_name', 'last_name', 'email', 'mobile_no', 'assembly_id', 'assembly_no',
  'booth_id', 'ward_id', 'candidate_party', 'candidate_type', 'position',
  'paid_status', 'is_active', 'district_id', 'category_name',
];

export async function update(req, res) {
  try {
    const body = req.body || {};
    const isSuperAdmin = Number(req.user?.group_id) === 1;

    const patch = {};
    if (body.name !== undefined) patch.first_name = body.name;
    for (const k of USER_UPDATABLE_FIELDS) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    // Role assignment is privileged: only a Super Admin may change the group.
    if (body.group_id !== undefined || body.user_group_id !== undefined) {
      if (!isSuperAdmin) {
        return res.status(403).json({ success: false, message: 'Not authorized to change user role.' });
      }
      patch.user_group_id = parseInt(body.group_id ?? body.user_group_id, 10);
    }

    // Password change: store bcrypt hash; keep displayable passcode in sync.
    if (body.password) {
      patch.password_str = String(body.password);
      patch.password = await bcrypt.hash(String(body.password), 10);
    }

    const user = await updateUser(req.params.id, patch);
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

export async function remove(req, res) {
  try {
    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

// Generate (or repair) the MLA (group 3) login for an assembly: sets a
// username derived from the assembly name and a fresh 7-digit passcode.
export async function generateCredentials(req, res) {
  try {
    const db = getAppDb();
    const no = parseInt(req.params.no, 10);
    if (Number.isNaN(no)) return res.status(400).json({ success: false, message: 'Invalid assembly number.' });

    const assembly = await db.collection('tbl_assembly_consitituency').findOne({ assembly_no: no });
    if (!assembly) return res.status(404).json({ success: false, message: 'Assembly not found.' });

    const name = assembly.assembly_name || `assembly_${no}`;
    const base = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.]/g, '') || `assembly_${no}`;

    const existing = await db.collection('tbl_user').findOne({ user_group_id: 3, assembly_id: no });

    // Ensure the username is unique across other users.
    let username = base, n = 1;
    while (await db.collection('tbl_user').findOne({ mobile_no: username, _id: { $ne: existing?._id } }, { projection: { _id: 1 } })) {
      username = `${base}_${n++}`;
    }

    const passcode = String(Math.floor(1000000 + Math.random() * 9000000));
    const password = await bcrypt.hash(passcode, 10);

    if (existing) {
      await db.collection('tbl_user').updateOne(
        { _id: existing._id },
        { $set: { mobile_no: username, password_str: passcode, password, is_active: 1 } }
      );
    } else {
      const id = await nextUserId();
      await insertUser({
        ...blankUser(), id, user_group_id: 3, first_name: name,
        mobile_no: username, assembly_id: no, assembly_no: no,
        parliament_id: assembly.parliament_id ?? '', district_id: assembly.district_id ?? 0,
        password_str: passcode, password, is_active: 1, paid_status: 'Yes',
      });
    }
    res.json({ success: true, assembly_no: no, username, passcode });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// Mirrors AssemblyController@assemblylistajax — per-assembly MLA (group 3) credentials.
export async function assemblyCredentials(req, res) {
  try {
    const db = getAppDb();
    const [assemblies, mlas] = await Promise.all([
      db.collection('tbl_assembly_consitituency').find({}).sort({ assembly_no: 1 }).toArray(),
      db.collection('tbl_user').find({ user_group_id: 3 }).toArray(),
    ]);
    const byAssembly = {};
    for (const m of mlas) byAssembly[String(m.assembly_id)] = m;
    res.json({
      success: true,
      rows: assemblies.map((a) => {
        const m = byAssembly[String(a.assembly_no)];
        return {
          assembly_no: a.assembly_no, assembly_name: a.assembly_name, district: a.district || '-',
          username: m?.mobile_no || '-', passcode: m?.password_str || '-',
        };
      }),
    });
  } catch (e) {
    res.status(503).json({ success: false, message: 'App database unavailable.' });
  }
}
