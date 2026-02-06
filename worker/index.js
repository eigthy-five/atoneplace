const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const ALLOWED = ['query2.finance.yahoo.com'];

// Cache crumb + cookie (shared across requests, refreshed when stale)
let cachedCrumb = null;
let cachedCookie = null;
let crumbExpiry = 0;

async function getCrumb() {
  if (cachedCrumb && Date.now() < crumbExpiry) return { crumb: cachedCrumb, cookie: cachedCookie };

  // Step 1: Hit fc.yahoo.com to get consent cookie
  const initResp = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const setCookies = initResp.headers.getAll?.('set-cookie') || [initResp.headers.get('set-cookie')].filter(Boolean);
  const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');

  // Step 2: Get crumb
  const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookieStr },
  });
  const crumb = await crumbResp.text();

  cachedCrumb = crumb;
  cachedCookie = cookieStr;
  crumbExpiry = Date.now() + 300000; // 5 min cache
  return { crumb, cookie: cookieStr };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // /quote?symbols=AAPL,MSFT — batch stock quotes with market cap
    if (url.pathname === '/quote') {
      const symbols = url.searchParams.get('symbols');
      if (!symbols) {
        return jsonResp({ error: 'Missing ?symbols= parameter' }, 400);
      }
      try {
        const { crumb, cookie } = await getCrumb();
        const yUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&crumb=${encodeURIComponent(crumb)}`;
        const resp = await fetch(yUrl, { headers: { 'User-Agent': UA, Cookie: cookie } });
        const data = await resp.json();
        const results = (data.quoteResponse?.result || []).map(q => ({
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice,
          change: q.regularMarketChangePercent,
          mktCap: q.marketCap || null,
        }));
        return jsonResp(results);
      } catch (e) {
        // Reset crumb cache on failure
        cachedCrumb = null;
        return jsonResp({ error: e.message }, 500);
      }
    }

    // Generic proxy: /?url=... (used for chart/indices)
    const target = url.searchParams.get('url');
    if (!target) {
      return jsonResp({ error: 'Use /quote?symbols= or /?url=' }, 400);
    }

    const targetUrl = new URL(target);
    if (!ALLOWED.includes(targetUrl.hostname)) {
      return jsonResp({ error: 'Domain not allowed' }, 403);
    }

    const resp = await fetch(target, { headers: { 'User-Agent': UA } });
    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  },
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}
