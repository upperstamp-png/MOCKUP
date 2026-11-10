'use strict';

require('dotenv').config();
const { getSupabaseAdmin } = require('../server/database/supabase');

async function ensureLocalSuperAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@kingsportsoficial.com.br').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'KingSports@2026!';
  const fullName = process.env.SEED_ADMIN_NAME || 'Super Admin King Sports';

  const db = getSupabaseAdmin();

  const { data: listData, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;

  let authUser = (listData?.users || []).find((u) => String(u.email || '').toLowerCase() === email);
  if (!authUser) {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (createErr) throw createErr;
    authUser = created.user;
    console.log('Supabase Auth user created:', email, authUser.id);
  } else {
    const { data: updated, error: updateErr } = await db.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (updateErr) throw updateErr;
    authUser = updated.user;
    console.log('Supabase Auth user synced:', email, authUser.id);
  }

  const { data: roleRow, error: roleErr } = await db
    .from('admin_roles')
    .select('id, slug, name')
    .eq('slug', 'super_admin')
    .single();
  if (roleErr || !roleRow) {
    throw new Error('Role super_admin not found in admin_roles. Run SQL migrations first.');
  }

  const { data: adminRow, error: adminErr } = await db
    .from('admin_users')
    .upsert(
      {
        auth_user_id: authUser.id,
        role_id: roleRow.id,
        full_name: fullName,
        email,
        is_active: true
      },
      { onConflict: 'email' }
    )
    .select('id, email, full_name, is_active')
    .single();
  if (adminErr) throw adminErr;

  console.log('Admin CRM user ready:', JSON.stringify(adminRow));
}

ensureLocalSuperAdmin().catch((err) => {
  console.error('Failed provisioning local Super Admin:', err.message);
  process.exit(1);
});
