// content-scraper.js — Clean MV3 rewrite
// Note: Keep minimal DOM reliance and return a normalized shape used by the rest of the app.

export function scrapeTinderPage() {
  try {
    const theirName = document.querySelector('.chatProfile h1 span:first-child')?.textContent?.trim() || 'Match';
    const theirAge = document.querySelector('.chatProfile h1 span.Typs\\(display-2-regular\\)')?.textContent?.trim();
    const profileContainer = document.querySelector('div[class*="Bgc(--color--background-sparks-profile)"]');

    const profileParts = [];
    if (theirAge) profileParts.push(`Age: ${theirAge}`);
    if (profileContainer) {
      profileContainer.querySelectorAll(':scope > div > div').forEach((section) => {
        const title = section.querySelector('h2')?.textContent?.trim();
        const text = section.textContent?.trim();
        if (title && text) profileParts.push(`${title}: ${text}`);
      });
    }

    const chatLog = document.querySelector('div[role="log"]');
    const conversationHistory = [];
    let currentDate = new Date().toISOString().slice(0, 10);

    chatLog?.querySelectorAll(':scope > *')?.forEach((node) => {
      if (node.tagName === 'TIME') {
        const t = node.textContent?.trim();
        if (t && /today|yesterday|\d{1,2}\/\d{1,2}/i.test(t)) currentDate = new Date().toISOString().slice(0, 10);
        return;
      }
      if (node.tagName === 'DIV' && node.getAttribute('role') === 'article') {
        const txt = node.querySelector('span.text')?.textContent?.trim();
        if (!txt) return;
        const isUser = node.classList.contains('Ta(e)');
        conversationHistory.push({ role: isUser ? 'user' : 'assistant', content: txt, date: currentDate });
      }
    });

    const locationEl = Array.from(document.querySelectorAll('.chatProfile .Typs\\(body-1-regular\\)'))
      .find(el => /kilometers away|miles away/i.test(el.textContent || ''));

    return {
      myName: 'You',
      theirName,
      theirProfile: [`Name: ${theirName}`, ...profileParts].join('\n'),
      isVerified: !!document.querySelector('.chatProfile h1 svg[title="Verified!"]'),
      matchLocation: locationEl?.textContent?.trim() || 'Not specified',
      conversationHistory,
      scrapedAt: new Date().toISOString(),
      error: null
    };
  } catch (e) {
    return { error: `Tinder scrape failed: ${e.message}` };
  }
}

export function pasteTextIntoTinderInput(text) {
  const el = document.querySelector('textarea[placeholder="Type a message"]');
  if (el) { el.value = text; el.dispatchEvent(new Event('input', { bubbles:true })); el.focus(); }
}

export function scrapeBumblePage() {
  try {
    const theirName = document.querySelector('[data-qa="profile-name"], h1')?.textContent?.trim() || 'Match';
    const profileEl = document.querySelector('[data-qa="profile-content"], .encounters-story') || document.body;
    const theirProfile = profileEl ? profileEl.textContent.trim().slice(0, 2000) : 'Not specified';

    const log = document.querySelector('[role="list"], [role="log"]');
    const conversationHistory = [];
    let currentDate = new Date().toISOString().slice(0, 10);
    log?.querySelectorAll('[role="listitem"], article, div')?.forEach((n) => {
      const txt = n.querySelector('p, .message, .bubble')?.textContent?.trim();
      if (!txt) return;
      const isUser = n.classList.contains('mine') || /self|me/i.test(n.className || '');
      conversationHistory.push({ role: isUser ? 'user' : 'assistant', content: txt, date: currentDate });
    });

    return {
      myName: 'You',
      theirName,
      theirProfile,
      isVerified: /verified/i.test(document.body.innerText || ''),
      matchLocation: 'Not specified',
      conversationHistory,
      scrapedAt: new Date().toISOString(),
      error: null
    };
  } catch (e) {
    return { error: `Bumble scrape failed: ${e.message}` };
  }
}

export function pasteTextIntoBumbleInput(text) {
  const el = document.querySelector('textarea, [contenteditable="true"]');
  if (el) {
    if ('value' in el) { el.value = text; el.dispatchEvent(new Event('input', { bubbles:true })); }
    else { el.textContent = text; el.dispatchEvent(new Event('input', { bubbles:true })); }
    el.focus();
  }
}