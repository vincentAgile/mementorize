// MEM-137: the loader of Umami's tracker, with its settings read at run time
// from the environment (UMAMI_SCRIPT_URL, UMAMI_WEBSITE_ID): the image holds
// no value of an environment. Asked by the root layout, in production only.
// Not configured: an empty script, nothing is loaded.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function GET() {
  const src = process.env.UMAMI_SCRIPT_URL?.trim() ?? '';
  const website = process.env.UMAMI_WEBSITE_ID?.trim() ?? '';
  let body = '';
  if (/^https:\/\/[^\s"'<>]+$/.test(src) && UUID.test(website)) {
    // data-performance: the « Performance » tab (Umami 3.1 or later). A
    // blocked or failing tracker changes nothing for the app.
    body = `(function(){var s=document.createElement('script');s.defer=true;s.src=${JSON.stringify(src)};s.setAttribute('data-website-id',${JSON.stringify(website)});s.setAttribute('data-performance','true');document.head.appendChild(s);})();`;
  }
  return new Response(body, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, max-age=3600' },
  });
}
