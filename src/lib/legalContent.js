/**
 * Load the legal pages for the public pages and the admin editor: the saved
 * text if an admin has saved it, otherwise the placeholder text.
 * Server only (uses the database).
 */

import { LEGAL_PAGES, getLegalPageInfo } from './legal';
import { DEFAULT_LEGAL_CONTENT, DEFAULT_LAST_UPDATED } from './legalDefaults';
import { getLegalPage } from './db';

/**
 * Shape a legal page for rendering or the admin editor. `row` is a
 * legal_pages row from getLegalPage(), or null when it's never been saved.
 */
export function toLegalPage(info, row) {
  return {
    slug: info.slug,
    title: info.title,
    path: info.path,
    content: row ? row.content : DEFAULT_LEGAL_CONTENT[info.slug],
    lastUpdated: row ? row.last_updated : DEFAULT_LAST_UPDATED,
    // When it was last saved (UTC, "YYYY-MM-DD HH:MM:SS") and by whom.
    updatedAt: row ? row.updated_at : null,
    updatedByName: row ? row.updated_by_name ?? null : null,
    isDefault: !row,
  };
}

/** One legal page by slug, or null for an unknown slug. */
export async function loadLegalPage(slug) {
  const info = getLegalPageInfo(slug);
  if (!info) return null;
  return toLegalPage(info, await getLegalPage(slug));
}

/** Every legal page, in LEGAL_PAGES order. */
export async function loadAllLegalPages() {
  return Promise.all(LEGAL_PAGES.map((page) => loadLegalPage(page.slug)));
}
