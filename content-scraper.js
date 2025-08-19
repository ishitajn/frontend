// content-scraper.js (Corrected with Robust Profile Scraping)

/**
 * This file contains functions intended to be executed as content scripts
 * on dating app domains. They are responsible for scraping page data
 * and interacting with the page's DOM.
 */

// ===================================================================================
// TINDER SCRAPER & PASTER
// ===================================================================================

const TINDER_SELECTORS = {
    myName: 'a[title="My Profile"] h2 span',
    theirName: '.chatProfile h1 span:first-child',
    theirAge: '.chatProfile h1 span.Typs\\(display-2-regular\\)',
    verified: '.chatProfile h1 svg[title="Verified!"]',
    profileContainer: 'div[class*="Bgc(--color--background-sparks-profile)"]',
    profileSection: ':scope > div > div',
    location: '.chatProfile .Typs\\(body-1-regular\\)',
    chatLogContainer: 'div[role="log"]',
    matchMessage: 'h1.Typs\\(display-3-regular\\)',
    chatNodes: ':scope > *',
    messageText: 'span.text',
    sentMessage: 'div[role="article"].Ta\\(e\\)',
    messageStatus: 'div[class*="msg__status"]',
    interestsSection: {
        title: 'interests',
        items: 'li span',
    },
    lookingForSection: {
        title: 'looking for',
        text: '.Typs\\(display-3-strong\\)',
        type: '.Bdrs\\(30px\\)',
    },
    genericSection: {
        items: 'li',
        key: 'h3',
        value: '.Typs\\(body-1-regular\\)',
    },
};

function parseTinderDate(dateText) {
    const today = new Date();
    const text = dateText.toLowerCase().trim();
    const formatDate = (d) => d.toISOString().split('T')[0];

    if (text === 'today') return formatDate(today);
    if (text === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        return formatDate(yesterday);
    }

    try {
        const dateOnlyText = text.split(',')[0];
        const parts = dateOnlyText.split('/');
        if (parts.length === 3) {
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            const month = parts[0].padStart(2, '0');
            const day = parts[1].padStart(2, '0');
            const isoDate = new Date(`${year}-${month}-${day}`);
            if (!isNaN(isoDate.getTime())) return formatDate(isoDate);
        }
        const parsed = new Date(text);
        if (!isNaN(parsed.getTime())) return formatDate(parsed);
    } catch (e) {
        console.warn('[Tinder Scraper] Could not parse date:', dateText);
    }
    return null;
}

function scrapeTinderProfile(theirName, theirAge) {
    const profileParts = [`Name: ${theirName}, Age: ${theirAge}`];
    const matchBasics = {};
    const profileContainer = document.querySelector(TINDER_SELECTORS.profileContainer);
    if (profileContainer) {
        const sections = profileContainer.querySelectorAll(TINDER_SELECTORS.profileSection);
        sections.forEach(sectionWrapper => {
            const parsedData = parseProfileSection(sectionWrapper);
            if (parsedData && parsedData.content) {
                profileParts.push(`\n${parsedData.title}:${parsedData.content}`);
                Object.assign(matchBasics, parsedData.basics);
            }
        });
    }
    return { theirProfile: profileParts.join('\n'), matchBasics };
}

function parseProfileSection(sectionWrapper) {
    const titleElement = sectionWrapper.querySelector('h2');
    if (!titleElement) return null;

    const title = titleElement.textContent.trim();
    const basics = {};
    let content = '';

    if (title.toLowerCase() === 'about me') {
        const aboutMeContentElement = titleElement.parentElement.nextElementSibling;
        if (aboutMeContentElement) {
            content = aboutMeContentElement.textContent.trim();
            if (content) basics['About'] = content;
        }
    } else if (title.toLowerCase() === TINDER_SELECTORS.interestsSection.title) {
        const interests = Array.from(sectionWrapper.querySelectorAll(TINDER_SELECTORS.interestsSection.items)).map(el => el.textContent.trim());
        content = interests.join(', ');
        if (content) basics['Interests'] = content;
    } else if (title.toLowerCase() === TINDER_SELECTORS.lookingForSection.title) {
        const lookingForText = sectionWrapper.querySelector(TINDER_SELECTORS.lookingForSection.text)?.textContent.trim();
        const relationshipType = sectionWrapper.querySelector(TINDER_SELECTORS.lookingForSection.type)?.textContent.trim();
        const items = [lookingForText, relationshipType].filter(Boolean);
        content = items.join('; ');
        if (lookingForText) basics['Looking for'] = lookingForText;
        if (relationshipType) basics['Relationship Type'] = relationshipType;
    } else {
        const items = [];
        sectionWrapper.querySelectorAll(TINDER_SELECTORS.genericSection.items).forEach(li => {
            const keyEl = li.querySelector(TINDER_SELECTORS.genericSection.key);
            const valueEl = li.querySelector(TINDER_SELECTORS.genericSection.value);
            if (keyEl && valueEl) {
                const key = keyEl.textContent.trim();
                const value = valueEl.textContent.trim();
                items.push(`${key}: ${value}`);
                basics[key] = value;
            } else {
                const text = li.textContent.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
                if (text) items.push(text);
            }
        });
        content = items.join('; ');
    }

    return { title, content, basics };
}

function scrapeTinderConversationHistory() {
    const conversationHistory = [];
    const chatLogContainer = document.querySelector(TINDER_SELECTORS.chatLogContainer);
    let currentDate = new Date().toISOString().split('T')[0];

    const matchMessageElement = chatLogContainer?.querySelector(TINDER_SELECTORS.matchMessage);
    if (matchMessageElement) {
        const matchText = matchMessageElement.textContent.trim();
        const match = matchText.match(/you matched with .* on (.*)/i);
        if (match && match[1]) {
            const date = parseTinderDate(match[1]);
            if (date) currentDate = date;
        }
    }

    const allChatNodes = chatLogContainer?.querySelectorAll(TINDER_SELECTORS.chatNodes);

    allChatNodes?.forEach(node => {
        if (node.tagName === 'TIME') {
            const dateText = node.textContent.trim();
            const parsedDate = parseTinderDate(dateText);
            if (parsedDate) {
                currentDate = parsedDate;
            }
            return;
        }

        if (node.tagName === 'DIV' && node.getAttribute('role') === 'article') {
            const messageText = node.querySelector(TINDER_SELECTORS.messageText)?.textContent.trim();
            if (!messageText) return;

            const isMyMessage = node.classList.contains('Ta(e)');
            const role = isMyMessage ? 'user' : 'assistant';
            
            const lastMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1] : null;

            if (lastMessage && lastMessage.role === role && lastMessage.date === currentDate) {
                lastMessage.content += `. ${messageText}`;
            } else {
                conversationHistory.push({
                    role,
                    content: messageText,
                    date: currentDate
                });
            }
        }
    });
    return conversationHistory;
}

export function scrapeTinderPage() {
    console.log('[Tinder Scraper] Starting scrapeTinderPage function.');
    try {
        const myNameElement = document.querySelector(TINDER_SELECTORS.myName);
        const myName = myNameElement ? myNameElement.textContent.trim() : "You";

        const theirNameElement = document.querySelector(TINDER_SELECTORS.theirName);
        const theirName = theirNameElement ? theirNameElement.textContent.trim() : "Match";
        
        const theirAgeElement = document.querySelector(TINDER_SELECTORS.theirAge);
        const theirAge = theirAgeElement ? theirAgeElement.textContent.trim() : "Not specified";

        const isVerified = !!document.querySelector(TINDER_SELECTORS.verified);

        const { theirProfile, matchBasics } = scrapeTinderProfile(theirName, theirAge);

        let matchLocation = "Not specified";
        const locationElement = Array.from(document.querySelectorAll(TINDER_SELECTORS.location))
                                     .find(el => el.textContent.includes('kilometers away') || el.textContent.includes('miles away'));
        if (locationElement) {
            matchLocation = locationElement.textContent.trim();
        }

        const conversationHistory = scrapeTinderConversationHistory();

        let lastMessageStatus = null;
        const sentMessages = document.querySelectorAll(TINDER_SELECTORS.sentMessage);
        if (sentMessages && sentMessages.length > 0) {
            const lastSentMessageContainer = sentMessages[sentMessages.length - 1];
            const statusElement = lastSentMessageContainer.querySelector(TINDER_SELECTORS.messageStatus);
            if (statusElement) {
                lastMessageStatus = statusElement.textContent.trim();
            }
        }

        const result = {
            myName,
            theirName,
            theirProfile,
            isVerified,
            matchLocation,
            matchDistance: matchLocation,
            matchOrigin: "Not specified",
            matchBasics,
            conversationHistory,
            lastMessageStatus,
            lastMessageRelativeTime: null,
            isDetailedProfilePage: false,
            myProfile: null,
            scrapedAt: new Date().toISOString(),
            error: null
        };

        console.log('[Tinder Scraper] Scraping complete. Final data object:', result);
        return result;

    } catch (e) {
        console.error('[Tinder Scraper] A critical error occurred during scraping:', e);
        return { error: `Scraping failed: ${e.message}` };
    }
}

export function pasteTextIntoTinderInput(textToPaste) {
    const messageInput = document.querySelector('textarea[placeholder="Type a message"]');
    if (messageInput) {
        messageInput.value = textToPaste;
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        messageInput.focus();
    }
}


// ===================================================================================
// BUMBLE SCRAPER & PASTER
// ===================================================================================

const BUMBLE_SELECTORS = {
    detailedProfilePage: 'section[data-qa-role="settings-section-about"]',
    myName: '[data-qa-role="sidebar-profile-name"]',
    theirProfilePane: 'aside.page__profile.is-expanded .profile',
    theirName: '[data-qa-role="profile-name"]',
    theirAge: '[data-qa-role="profile-age"]',
    verified: '.profile__verify span[data-qa-icon-name="badge-feature-verification"]',
    bio: '[data-qa-role="profile-bio"]',
    location: '.location-widget__town',
    distance: '.location-widget__distance',
    origin: '.location-widget__pill .pill__title',
    prompts: '.profile__section--answer',
    promptQuestion: '.profile-answer__title',
    promptAnswer: '.profile-answer__text',
    pills: '.profile__badges .pill[data-qa-role="pill"]',
    pillTitle: '.pill__title',
    pillImage: 'img',
    messageList: '[data-qa-role="message-list"]',
    messageGroupDate: '.message-group-date',
    message: '.message',
    messageIn: '.message--in',
    messageBubble: '.message-bubble__text',
    lastMessageGroup: '.message-group:last-of-type',
    lastMessageTimestamp: '.message-group__timestamp',
    headerName: '.messages-header__name-link',
};

function parseBumblePill(pillElement) {
    const value = pillElement.querySelector(BUMBLE_SELECTORS.pillTitle)?.textContent.trim() || '';
    const img = pillElement.querySelector(BUMBLE_SELECTORS.pillImage);
    let key = 'interest';
    if (img) {
        const src = img.getAttribute('src') || '';
        const match = src.match(/ic_badge_profileChips_dating_([a-zA-Z]+)v2\.png/);
        if (match && match[1]) {
            key = match[1].toLowerCase().replace(/v$/, '');
        }
    }
    return { key, value };
}

function parseBumbleDateDivider(dateText, today, yesterday) {
    const text = dateText.toLowerCase();
    const formatDate = (d) => d.toISOString().split('T')[0];

    if (text.includes('ago') || text.includes('now') || text.includes(' min') || text.includes(' hr')) {
        return null;
    }

    if (text === 'today') return formatDate(today);
    if (text === 'yesterday') return formatDate(yesterday);

    try {
        const parsed = new Date(dateText);
        if (!isNaN(parsed.getTime())) {
            if (parsed.getFullYear() < 2000) {
                parsed.setFullYear(today.getFullYear());
            }
            return formatDate(parsed);
        }
    } catch (e) { /* Continue */ }

    const parts = dateText.replace(/,/g, '').split(' ');
    if (parts.length >= 2) {
        const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        const monthIndex = monthNames.indexOf(parts[0].toLowerCase());
        const day = parseInt(parts[1], 10);
        let year = today.getFullYear();

        if (parts.length === 3 && !isNaN(parseInt(parts[2], 10))) {
            year = parseInt(parts[2], 10);
        }

        if (monthIndex > -1 && !isNaN(day)) {
            try {
                const manualDate = new Date(year, monthIndex, day);
                return formatDate(manualDate);
            } catch (e) {
                console.warn('[Bumble Scraper] Manual date construction failed for:', dateText);
            }
        }
    }

    console.warn('[Bumble Scraper] Could not parse date divider:', dateText);
    return null;
}

function scrapeBumbleProfile() {
    let theirProfile = "Match profile not visible.", theirName = "Match", isVerified = false,
        matchLocation = "Not specified", matchDistance = "Not specified", matchOrigin = "Not specified",
        matchBasics = {};

    try {
        const theirProfilePane = document.querySelector(BUMBLE_SELECTORS.theirProfilePane);
        if (theirProfilePane) {
            const profileParts = [];
            const nameEl = theirProfilePane.querySelector(BUMBLE_SELECTORS.theirName);
            const ageEl = theirProfilePane.querySelector(BUMBLE_SELECTORS.theirAge);
            theirName = nameEl?.textContent.trim() || "Match";
            const age = ageEl?.textContent.replace(',', '').trim();
            isVerified = !!theirProfilePane.querySelector(BUMBLE_SELECTORS.verified);
            profileParts.push(`\nName: ${theirName}, Age: ${age}`);

            const about = theirProfilePane.querySelector(BUMBLE_SELECTORS.bio)?.textContent.trim();
            if (about) profileParts.push(`About Them:${about}`);
            matchLocation = theirProfilePane.querySelector(BUMBLE_SELECTORS.location)?.textContent.trim() || "Not specified";
            matchDistance = theirProfilePane.querySelector(BUMBLE_SELECTORS.distance)?.textContent.trim() || "Not specified";
            matchOrigin = theirProfilePane.querySelector(BUMBLE_SELECTORS.origin)?.textContent.trim() || "Not specified";
            const promptNodes = theirProfilePane.querySelectorAll(BUMBLE_SELECTORS.prompts);
            const prompts = Array.from(promptNodes).map(s => {
                const q = s.querySelector(BUMBLE_SELECTORS.promptQuestion)?.textContent.trim();
                const a = s.querySelector(BUMBLE_SELECTORS.promptAnswer)?.textContent.trim();
                return (q && a) ? `- ${q}: ${a}` : null;
            }).filter(Boolean);

            if(prompts.length > 0) profileParts.push(`Their Profile Prompts:\n${prompts.join('; ')}`);
            const pillNodes = theirProfilePane.querySelectorAll(BUMBLE_SELECTORS.pills);
            const basicsList = [];
            pillNodes.forEach(pill => {
                const { key, value } = parseBumblePill(pill);
                matchBasics[key] = value;
                basicsList.push(`${key}: ${value}`);
            });

            if (basicsList.length > 0) profileParts.push(`Their Basics & Interests:\n${basicsList.join('; ')}`);
            theirProfile = profileParts.join('\n');
        }
    } catch (e) {
        console.error('[Bumble Scraper] Error scraping match profile:', e);
        theirProfile = `Could not fully parse match profile. Error: ${e.message}`;
    }

    if (theirName === "Match") {
        const nameInHeader = document.querySelector(BUMBLE_SELECTORS.headerName)?.textContent.trim();
        if (nameInHeader) theirName = nameInHeader;
    }

    return { theirProfile, theirName, isVerified, matchLocation, matchDistance, matchOrigin, matchBasics };
}

function scrapeBumbleConversationHistory() {
    let conversationHistory = [], lastMessageRelativeTime = null;
    try {
        const messageListEl = document.querySelector(BUMBLE_SELECTORS.messageList);
        if (messageListEl) {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            
            let currentDateString = today.toISOString().split('T')[0];
            const tempHistory = [];

            const allNodes = messageListEl.querySelectorAll(`${BUMBLE_SELECTORS.messageGroupDate}, ${BUMBLE_SELECTORS.message}`);

            allNodes.forEach(node => {
                if (node.classList.contains('message-group-date')) {
                    const dateText = node.textContent.trim();
                    const newDateFound = parseBumbleDateDivider(dateText, today, yesterday);
                    if (newDateFound) {
                        currentDateString = newDateFound;
                    }
                    return;
                }

                if (node.classList.contains('message')) {
                    const role = node.matches(BUMBLE_SELECTORS.messageIn) ? 'assistant' : 'user';
                    const content = node.querySelector(BUMBLE_SELECTORS.messageBubble)?.textContent.trim();
                    if (content) {
                        tempHistory.push({ role, content, date: currentDateString });
                    }
                }
            });

            conversationHistory = tempHistory.reduce((acc, msg) => {
                const lastMessage = acc.length > 0 ? acc[acc.length - 1] : null;
                if (lastMessage?.role === msg.role && lastMessage?.date === msg.date) {
                    lastMessage.content += `. ${msg.content}`;
                } else {
                    acc.push(msg);
                }
                return acc;
            }, []).slice(-20);

            const lastMessageGroup = messageListEl.querySelector(BUMBLE_SELECTORS.lastMessageGroup);
            if (lastMessageGroup) {
                const timeStampNode = lastMessageGroup.querySelector(BUMBLE_SELECTORS.lastMessageTimestamp);
                if (timeStampNode && timeStampNode.textContent.includes('ago')) {
                    lastMessageRelativeTime = timeStampNode.textContent.trim();
                }
            }
        }
    } catch (e) {
        console.error('[Bumble Scraper] Error scraping conversation history:', e);
        conversationHistory = [];
    }
    return { conversationHistory, lastMessageRelativeTime };
}

export function scrapeBumblePage() {
    console.log('[Bumble Scraper] Starting scrapeBumblePage function.');
    try {
        const isDetailedProfilePage = !!document.querySelector(BUMBLE_SELECTORS.detailedProfilePage);
        const myName = document.querySelector(BUMBLE_SELECTORS.myName)?.textContent.trim() || "Me";
        
        let myProfile = null, theirProfile, theirName, isVerified, matchLocation, matchDistance, matchOrigin, matchBasics, conversationHistory, lastMessageRelativeTime;

        if (isDetailedProfilePage) {
            console.log('[Bumble Scraper] Detected detailed profile page. Skipping chat/match scrape.');
        } else {
            console.log('[Bumble Scraper] Detected chat page. Proceeding with full scrape.');
            ({ theirProfile, theirName, isVerified, matchLocation, matchDistance, matchOrigin, matchBasics } = scrapeBumbleProfile());
            ({ conversationHistory, lastMessageRelativeTime } = scrapeBumbleConversationHistory());
        }

        const result = { 
            myName, 
            theirName, 
            theirProfile,
            isVerified,
            matchLocation, 
            matchDistance, 
            matchOrigin, 
            matchBasics, 
            conversationHistory,
            lastMessageRelativeTime,
            isDetailedProfilePage,
            myProfile,
            scrapedAt: new Date().toISOString(),
            error: null 
        };

        console.log('[Bumble Scraper] Scraping complete. Final data object:', result);
        return result;

    } catch (e) {
        console.error('[Bumble Scraper] A critical error occurred during scraping:', e);
        return { error: `Scraping failed: ${e.message}` };
    }
}

export function pasteTextIntoBumbleInput(textToPaste) {
    const messageInput = document.querySelector('textarea[data-qa-role="message-input"]') || document.querySelector('textarea.textarea__input[placeholder^="Start chatting..."]');
    if (messageInput) {
        messageInput.value = textToPaste;
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        messageInput.focus();
    }
}
