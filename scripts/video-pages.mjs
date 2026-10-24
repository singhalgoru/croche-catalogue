import { escapeHtml, toProductSlug } from './prerender.mjs';
import { renderSiteHeader, renderSiteFooter } from './content-pages.mjs';

const ORIGIN = 'https://luviacreations.com';
export const videoPath = product => `/watch/${toProductSlug(product)}/`;
export const videoTitle = product => product.makingVideo.title?.trim() || `Making ${product.name}`;
export const videoDescription = product => `Watch ${product.name} being made by Luvia Creations. A behind-the-scenes look at our handmade crochet work.`;

export const videoSchema = product => {
  const video = product.makingVideo;
  return {
    '@type': 'VideoObject',
    name: videoTitle(product),
    description: videoDescription(product),
    thumbnailUrl: [video.posterUrl],
    contentUrl: video.videoUrl,
    url: `${ORIGIN}${videoPath(product)}`,
    duration: `PT${video.durationSeconds}S`,
    ...(video.uploadDate ? { uploadDate: video.uploadDate } : {}),
  };
};

export const videoPlayer = product => {
  const video = product.makingVideo;
  return `<video controls controlslist="nodownload" playsinline preload="none" width="${video.width}" height="${video.height}" poster="${escapeHtml(video.posterUrl)}" src="${escapeHtml(video.videoUrl)}" aria-label="${escapeHtml(videoTitle(product))}" style="display:block;width:100%;height:auto;max-height:75vh;object-fit:contain"><p>Your browser cannot play this video.</p></video>`;
};

export const renderVideoPage = product => `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(videoTitle(product))} | Luvia Creations</title>
<meta name="description" content="${escapeHtml(videoDescription(product))}">
<meta name="robots" content="index, follow, max-image-preview:large, max-video-preview:-1">
<link rel="canonical" href="${ORIGIN}${videoPath(product)}">
<link rel="icon" href="/images/favicon-96.png">
<meta property="og:type" content="video.other"><meta property="og:title" content="${escapeHtml(videoTitle(product))}">
<meta property="og:description" content="${escapeHtml(videoDescription(product))}">
<meta property="og:url" content="${ORIGIN}${videoPath(product)}"><meta property="og:image" content="${escapeHtml(product.makingVideo.posterUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(videoTitle(product))}">
<meta name="twitter:description" content="${escapeHtml(videoDescription(product))}">
<meta name="twitter:image" content="${escapeHtml(product.makingVideo.posterUrl)}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; media-src https:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'" />
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: videoTitle(product), url: `${ORIGIN}${videoPath(product)}`, mainEntity: videoSchema(product) }).replace(/</g, '\\u003c')}</script>
<style>*{box-sizing:border-box}body{margin:0;background:#fffaf0;color:#604239;font:16px/1.6 system-ui,sans-serif}header,main,footer{max-width:960px;margin:auto;padding:20px}header{border-bottom:3px solid #edc357}.brand{display:flex;align-items:center;gap:12px;font-weight:700;text-decoration:none}.brand img{border-radius:50%}.skip{position:absolute;left:-10000px}.skip:focus{left:16px;top:8px;background:white;padding:8px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:16px}footer{border-top:1px solid #edc357;margin-top:32px;overflow-wrap:anywhere}.note{font-size:.9rem}a{color:inherit}a:focus-visible{outline:3px solid #604239;outline-offset:4px}h1{line-height:1.2}video{background:#eee;border-radius:12px}</style>
</head><body>${renderSiteHeader()}
<main id="main"><h1>${escapeHtml(videoTitle(product))}</h1>${videoPlayer(product)}
<p>${escapeHtml(videoDescription(product))}</p>
<p><a href="/p/${toProductSlug(product)}/">View ${escapeHtml(product.name)} — photos, options and ordering</a></p>
</main>${renderSiteFooter()}</body></html>`;

export const videoSitemapEntry = product => {
  const video = product.makingVideo;
  return `<video:video><video:thumbnail_loc>${escapeHtml(video.posterUrl)}</video:thumbnail_loc><video:title>${escapeHtml(videoTitle(product))}</video:title><video:description>${escapeHtml(videoDescription(product))}</video:description><video:content_loc>${escapeHtml(video.videoUrl)}</video:content_loc><video:duration>${Math.ceil(video.durationSeconds)}</video:duration>${video.uploadDate ? `<video:publication_date>${video.uploadDate}</video:publication_date>` : ''}</video:video>`;
};

export const fetchVideoUploadDate = async product => {
  const response = await fetch(product.makingVideo.videoUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
  const modified = response.headers.get('last-modified');
  if (!response.ok || !modified || !Number.isFinite(Date.parse(modified))) {
    throw new Error(`Unable to read published video upload date for ${product.name} (HTTP ${response.status}).`);
  }
  return new Date(modified).toISOString();
};
