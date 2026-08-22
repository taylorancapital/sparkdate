// lib/social-requests.js
//
// Builds the exact HTTP requests each surface needs, as plain data. Pure: no
// network. The senders in scripts/social.js do nothing but execute what this
// returns, so the shape of every call -- which is where the per-platform
// quirks live -- is unit-testable without touching a live account.
//
// The three surfaces differ more than they look:
//
//   Facebook  really schedules. A single photo goes to /photos directly; a
//             carousel has to upload each image UNPUBLISHED first, collect
//             the ids, then attach them to a /feed post. There is no
//             one-shot multi-photo call.
//   Instagram cannot schedule at all, and builds posts from containers. A
//             carousel needs child containers flagged is_carousel_item, then
//             a CAROUSEL parent, then a publish. Containers expire in 24h.
//   TikTok    takes one JSON body, pulls the media from public URLs itself,
//             and (in MEDIA_UPLOAD mode) lands in drafts without needing the
//             audit that DIRECT_POST requires.

'use strict';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TIKTOK_INIT = 'https://open.tiktokapis.com/v2/post/publish/content/init/';

/**
 * Full caption text for a surface.
 * Instagram captions never render a link, so the link is deliberately omitted
 * there -- the caption says "link in bio" and the bio carries the
 * utm_source=Instagram URL. Putting the Facebook URL in an IG caption would
 * not 404, it would silently misattribute every click.
 */
function composeCaption(row, surface) {
  const parts = [String(row.caption || '').trim()];
  const tags = String(row.hashtags || '').trim();

  if (surface === 'fb' && row.link_fb) parts.push(String(row.link_fb).trim());
  if (tags) parts.push(tags);

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Asset URLs for a surface, routed by shape.
 *
 * A "Single image + Story" row carries both a 1080x1080 feed image and a
 * 1080x1920 story frame in one asset_files cell (MC-01 and TL-06 both do).
 * Handing the whole list to a feed post puts a vertical story frame into a
 * Facebook carousel, where it gets cropped and looks broken; handing it to a
 * Story posts the square one. So feed surfaces take the non-_story files and
 * story surfaces take the _story files.
 *
 * Fallback matters: if a row has no file matching its surface's shape (a
 * story row whose single asset was never suffixed, say), use everything
 * rather than silently posting nothing.
 */
function assetUrls(row, baseUrl, surface) {
  const all = String(row.asset_files || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  let picked = all;
  if (surface === 'ig_story') {
    const story = all.filter((f) => /_story\./i.test(f));
    picked = story.length ? story : all;
  } else if (surface === 'tiktok') {
    // TikTok's feed is vertical. The square carousels are what exist (111 of
    // them), and TikTok's API accepts them -- 1080x1080 fits inside the
    // 1080x1920 bound -- so they post, letterboxed. That reads as cross-posted
    // Instagram content, which is exactly the shape TikTok's ranking
    // deprioritises.
    //
    // So a `_tt` file is preferred where one has been rendered, and the
    // squares remain the fallback: a letterboxed post still beats no post,
    // and this must not start silently dropping rows that have art.
    const vertical = all.filter((f) => /_tt\./i.test(f));
    if (vertical.length) picked = vertical;
    else {
      const feed = all.filter((f) => !/_story\./i.test(f));
      picked = feed.length ? feed : all;
    }
  } else if (surface) {
    const feed = all.filter((f) => !/_story\./i.test(f) && !/_tt\./i.test(f));
    picked = feed.length ? feed : all;
  }

  return picked.map((f) => `${String(baseUrl).replace(/\/$/, '')}/${f}`);
}

// ------------------------------------------------------------------ facebook

/**
 * @returns {{steps: Array}} ordered steps. A step with `collectId` feeds its
 * returned id into the next step's `attached_media`.
 */
function buildFacebook(row, { pageId, baseUrl, scheduledAt }) {
  const urls = assetUrls(row, baseUrl, 'fb');
  const message = composeCaption(row, 'fb');
  if (!urls.length) throw new Error(`${row.row_id}: no assets`);

  // scheduled_publish_time is seconds, not ms. Passing ms schedules the post
  // roughly fifty thousand years out and Meta accepts it without complaint.
  const schedule = scheduledAt
    ? { published: 'false', scheduled_publish_time: String(Math.floor(scheduledAt / 1000)) }
    : { published: 'true' };

  if (urls.length === 1) {
    return {
      steps: [{
        name: 'photo',
        method: 'POST',
        url: `${GRAPH}/${pageId}/photos`,
        form: { url: urls[0], caption: message, ...schedule },
        returns: 'post_id',
      }],
    };
  }

  const steps = urls.map((u, i) => ({
    name: `upload_${i + 1}`,
    method: 'POST',
    url: `${GRAPH}/${pageId}/photos`,
    // Unpublished uploads are staged media, never visible on their own.
    // They must NOT carry scheduled_publish_time -- only the feed post does.
    form: { url: u, published: 'false' },
    collectId: true,
  }));

  steps.push({
    name: 'feed',
    method: 'POST',
    url: `${GRAPH}/${pageId}/feed`,
    form: { message, ...schedule },
    attachCollectedAs: 'attached_media',
    returns: 'id',
  });

  return { steps };
}

// ----------------------------------------------------------------- instagram

function buildInstagram(row, { igUserId, baseUrl, isStory = false }) {
  const urls = assetUrls(row, baseUrl, isStory ? 'ig_story' : 'ig');
  const caption = composeCaption(row, 'ig');
  if (!urls.length) throw new Error(`${row.row_id}: no assets`);

  const media = `${GRAPH}/${igUserId}/media`;
  const publish = `${GRAPH}/${igUserId}/media_publish`;

  if (isStory) {
    // Stories accept exactly one image per frame. Link and countdown
    // stickers cannot be attached via the API at all -- rows that need them
    // carry manual_reason and never reach here.
    return {
      steps: [
        { name: 'container', method: 'POST', url: media, form: { image_url: urls[0], media_type: 'STORIES' }, collectId: true, poll: true },
        { name: 'publish', method: 'POST', url: publish, form: {}, attachCollectedAs: 'creation_id', returns: 'id' },
      ],
    };
  }

  if (urls.length === 1) {
    return {
      steps: [
        { name: 'container', method: 'POST', url: media, form: { image_url: urls[0], caption }, collectId: true, poll: true },
        { name: 'publish', method: 'POST', url: publish, form: {}, attachCollectedAs: 'creation_id', returns: 'id' },
      ],
    };
  }

  if (urls.length > 10) throw new Error(`${row.row_id}: ${urls.length} slides, Instagram carousels cap at 10`);

  const steps = urls.map((u, i) => ({
    name: `child_${i + 1}`,
    method: 'POST',
    url: media,
    // Children carry no caption -- only the parent does.
    form: { image_url: u, is_carousel_item: 'true' },
    collectId: true,
    poll: true,
  }));

  steps.push({
    name: 'carousel',
    method: 'POST',
    url: media,
    form: { media_type: 'CAROUSEL', caption },
    attachCollectedAs: 'children',
    collectId: true,
    poll: true,
    replacesCollected: true,
  });

  steps.push({
    name: 'publish',
    method: 'POST',
    url: publish,
    form: {},
    attachCollectedAs: 'creation_id',
    returns: 'id',
  });

  return { steps };
}

// -------------------------------------------------------------------- tiktok

function buildTikTok(row, { baseUrl, mode = 'UPLOAD_TO_DRAFT', privacyLevel = 'SELF_ONLY' }) {
  const urls = assetUrls(row, baseUrl, 'tiktok');
  if (!urls.length) throw new Error(`${row.row_id}: no assets`);
  if (urls.length > 35) throw new Error(`${row.row_id}: TikTok photo posts cap at 35 images`);

  // TikTok titles cap at 150 -- much shorter than an Instagram caption, so
  // the X-length copy is the better source when it exists.
  const title = String(row.caption_x || row.caption || '').replace(/\n+/g, ' ').trim().slice(0, 150);

  const direct = mode === 'DIRECT_POST';

  // DIRECT_POST publishes for real, so the privacy level is load-bearing
  // rather than cosmetic. TikTok rejects any value the creator's account does
  // not actually allow, and an UNAUDITED app is capped at SELF_ONLY no matter
  // what is sent -- so a run that "succeeded" before the audit clears has
  // posted privately, visible to nobody. `social-preflight` queries the real
  // allowed list; this only refuses values TikTok does not define at all.
  const ALLOWED = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
  if (direct && !ALLOWED.includes(privacyLevel)) {
    throw new Error(`${row.row_id}: privacy_level "${privacyLevel}" is not one of ${ALLOWED.join(', ')}`);
  }

  const post_info = direct
    ? { title, description: title, privacy_level: privacyLevel }
    // A draft is not published, so it carries no privacy level -- sending one
    // is what produces TikTok's unhelpful "invalid_params" on MEDIA_UPLOAD.
    // The human picks visibility in the app when they tap post.
    : { title, description: title };

  return {
    steps: [{
      name: 'init',
      method: 'POST',
      url: TIKTOK_INIT,
      json: {
        // MEDIA_UPLOAD lands in the account's drafts and works WITHOUT
        // TikTok's 2-4 week audit. DIRECT_POST requires it.
        post_mode: direct ? 'DIRECT_POST' : 'MEDIA_UPLOAD',
        media_type: 'PHOTO',
        post_info,
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: 0,
          photo_images: urls,
        },
      },
      returns: 'publish_id',
    }],
  };
}

function buildFor(surface, row, ctx) {
  if (surface === 'fb') return buildFacebook(row, ctx);
  if (surface === 'ig') return buildInstagram(row, ctx);
  if (surface === 'ig_story') return buildInstagram(row, { ...ctx, isStory: true });
  if (surface === 'tiktok') return buildTikTok(row, ctx);
  throw new Error(`unknown surface: ${surface}`);
}

module.exports = {
  composeCaption, assetUrls,
  buildFacebook, buildInstagram, buildTikTok, buildFor,
  GRAPH, TIKTOK_INIT,
};
