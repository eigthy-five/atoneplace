const ALLOWED = ['query2.finance.yahoo.com'];

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const targetUrl = new URL(target);
    if (!ALLOWED.includes(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
        status: 403,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}
