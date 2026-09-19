// Vercel serverless function. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS'
};

const json = (res, status, body) =>
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(body));

function getConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

async function db(path, options = {}) {
  const { url, key } = getConfig();
  if (!url || !key) {
    throw new Error('Backend não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=representation',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  return response.status === 204 ? [] : response.json();
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).set(headers).end();
  res.set(headers);

  try {
    const rawBody = req.body || {};
    const email = String(req.query.email || rawBody.email || '').trim().toLowerCase();

    if (!email) return json(res, 400, { error: 'email é obrigatório' });

    if (req.method === 'GET') {
      const profiles = await db(`profiles?email=eq.${encodeURIComponent(email)}&limit=1`);
      const applications = await db(`applications?email=eq.${encodeURIComponent(email)}&order=created_at.desc`);
      return json(res, 200, {
        profile: profiles[0] || null,
        applications
      });
    }

    if (req.method === 'PUT') {
      // Never persist client-only fields or timestamps supplied by the browser.
      const profile = {
        email,
        nome: String(rawBody.nome || '').trim(),
        telefone: String(rawBody.telefone || '').trim(),
        dataNascimento: String(rawBody.dataNascimento || '').trim(),
        formacao: String(rawBody.formacao || '').trim(),
        instituicao: String(rawBody.instituicao || '').trim(),
        funcao: String(rawBody.funcao || '').trim(),
        area: String(rawBody.area || '').trim(),
        experiencias: String(rawBody.experiencias || '').trim(),
        idiomas: String(rawBody.idiomas || '').trim(),
        cursos: String(rawBody.cursos || '').trim(),
        cursosSalvos: Array.isArray(rawBody.cursosSalvos) ? rawBody.cursosSalvos : []
      };

      const rows = await db('profiles?on_conflict=email', {
        method: 'POST',
        body: JSON.stringify(profile),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
      });

      const applications = await db(`applications?email=eq.${encodeURIComponent(email)}&order=created_at.desc`);
      return json(res, 200, { profile: rows[0] || profile, applications });
    }

    return json(res, 405, { error: 'Método não permitido' });
  } catch (error) {
    console.error('profile API error:', error);
    return json(res, 500, { error: error.message || 'Erro interno ao salvar o perfil' });
  }
};
