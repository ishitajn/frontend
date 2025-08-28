import nlp from './lib/compromise.js';

const DEBUG = {
    log: (category, message, data = null) => console.log(`[WINGMAN-HELPER-${category.toUpperCase()}] ${message}`, data ?? ''),
};

// ===================================================================================
// SECTION 1: CORE STATE & SUBTEXT ANALYSIS
// ===================================================================================

/**
 * Analyzes the subtext of a single message for emotion, intent, and nuance.
 * @param {object} doc - A compromise.js document object.
 * @returns {Omit<LastMessageAnalysis, 'isDirectQuestion' | 'isLowEffort' | 'isGeoRelated' | 'suggestedResponseStyle' | 'questionInfo'>} A structured object containing detailed subtext analysis.
 */
let wordLists = null;

async function loadWordLists() {
    if (wordLists) return wordLists;

    try {
        const [positiveWordsRes, negativeWordsRes, arousalWordsRes, vulnerableWordsRes, sexualWordsRes] = await Promise.all([
            fetch(chrome.runtime.getURL('data/positiveWords.json')),
            fetch(chrome.runtime.getURL('data/negativeWords.json')),
            fetch(chrome.runtime.getURL('data/arousalWords.json')),
            fetch(chrome.runtime.getURL('data/vulnerableWords.json')),
            fetch(chrome.runtime.getURL('data/sexualWords.json'))
        ]);

        const positiveWords = await positiveWordsRes.json();
        const negativeWords = await negativeWordsRes.json();
        const arousalWords = await arousalWordsRes.json();
        const vulnerableWords = await vulnerableWordsRes.json();
        const sexualWords = await sexualWordsRes.json();

        wordLists = { positiveWords, negativeWords, arousalWords, vulnerableWords, sexualWords };
        return wordLists;
    } catch (error) {
        DEBUG.error('WORDLISTS', 'Failed to load word lists from JSON files.', error);
        // As a fallback, return empty lists to prevent crashing the analysis.
        return {
            positiveWords: {},
            negativeWords: {},
            arousalWords: {},
            vulnerableWords: [],
            sexualWords: []
        };
    }
}

export async function analyzeMessageSubtext(doc) {
    const subtext = {
        valence: 0.0,
        arousal: 0.0,
        intents: new Set(),
        isSarcastic: false,
        isAmbiguous: false,
        isVulnerable: false,
    };

    const { positiveWords, negativeWords, arousalWords, vulnerableWords, sexualWords } = await loadWordLists();

    const sexualEmojis = /😏|😈|🔥|💦|🥵|😜|😉|💋|👅|🍑|🍆|🛏️|🤤|😇|👀|💅|✨|🫦|👉|👌|👇|👆|💨|♋|💥|💫|🌶️|🍭|🍦|🍩|🌮|🌭|🍌|🍒|🍾|🥂|⛓️|🔗|🪢|🪚|🔨|📍|📌|🕯️|🔑|🔐|🍼/;
    const text = doc.text('text');
    Object.entries(positiveWords).forEach(([word, score]) => {
        if (doc.has(word))
            subtext.valence += score;
    });
    Object.entries(negativeWords).forEach(([word, score]) => {
        if (doc.has(word))
            subtext.valence += score;
    });
    Object.entries(arousalWords).forEach(([word, score]) => {
        if (text.includes(word))
            subtext.arousal += score;
    });

    if (analyzeQuestion(doc).isQuestion)
        subtext.intents.add('questioning');
    if (detectLogisticsSignal(doc))
        subtext.intents.add('planning');
    if (doc.has('(haha|lol|lmao|rofl)'))
        subtext.intents.add('reacting_to_humor');
    if (doc.has('#PastTense') && doc.wordCount() > 15)
        subtext.intents.add('storytelling');
    if (doc.has(sexualWords.join('|')) || sexualEmojis.test(text))
        subtext.intents.add('flirting_or_sexual');
    if (subtext.intents.has('flirting_or_sexual')) {
        subtext.valence += 0.5;
        subtext.arousal += 0.7;
    }
    const sarcasticMarkers = ['(yeah right|sure|whatever|obviously)', '(so|totally|just) #Adverb? #PositiveAdjective'];
    if (doc.has(sarcasticMarkers.join('|')) && subtext.valence > 0)
        subtext.isSarcastic = true;

    const ambiguousPhrases = ['im down', 'sounds good', 'maybe', 'we should', 'sometime'];
    if (doc.has(ambiguousPhrases.join('|')) && !subtext.intents.has('planning'))
        subtext.isAmbiguous = true;

    if (doc.has(vulnerableWords.join('|')))
        subtext.isVulnerable = true;

    subtext.valence = Math.max(-1, Math.min(1, subtext.valence));
    subtext.arousal = Math.max(-1, Math.min(1, subtext.arousal));
    subtext.intents = Array.from(subtext.intents);

    return subtext;
}

/**
 * Analyzes only the last message from the match for immediate response context.
 * @param {Message[]} conversationHistory
 * @returns {LastMessageAnalysis} A structured subtext object or a default neutral object.
 */
export async function analyzeLastMessageForSubtext(conversationHistory) {
    const lastMessageFromMatch = conversationHistory?.filter(msg => msg.role === 'assistant').pop();
    if (!lastMessageFromMatch?.content) {
        return {
            valence: 0.0,
            arousal: 0.0,
            intents: [],
            isSarcastic: false,
            isAmbiguous: false,
            isVulnerable: false,
            isDirectQuestion: false,
            isLowEffort: true,
            isGeoRelated: false,
            suggestedResponseStyle: 'playful',
            questionInfo: {
                isQuestion: false,
                count: 0,
                type: 'none'
            },
        };
    }

    const doc = nlp(lastMessageFromMatch.content);
    const subtext = await analyzeMessageSubtext(doc);
    const questionInfo = analyzeQuestion(doc);
    DEBUG.log('SUBTEXT', 'Last message analysis complete', {
        content: lastMessageFromMatch.content,
        questionInfo,
        subtext
    });

    return {
        ...subtext,
        isDirectQuestion: questionInfo.isQuestion,
        questionInfo: questionInfo,
        isLowEffort: isLowEffortReply(lastMessageFromMatch.content),
        isGeoRelated: isMessageGeoRelated(lastMessageFromMatch.content),
        suggestedResponseStyle: suggestStyleFromText(lastMessageFromMatch.content),
    };
}

// ===================================================================================
// SECTION 2: DYNAMIC MEMORY MANAGEMENT
// ===================================================================================

/**
 * Updates the memory object based on the entire conversation history.
 * @param {Message[]} conversationHistory
 * @param {MatchMemory} storedMemory
 * @returns {MatchMemory} The updated memory object.
 */
export async function updateMemoryFromHistory(conversationHistory, storedMemory) {
    let memory = JSON.parse(JSON.stringify(storedMemory || {
                topics: {},
                insideJokes: [],
                avoidedTopics: [],
                questionHistory: [],
                dateArcPhase: 'rapport'
            }));

    for (let i = 0; i < conversationHistory.length - 1; i++) {
        if (conversationHistory[i].role === 'user' && conversationHistory[i + 1].role === 'assistant') {
            const userDoc = nlp(conversationHistory[i].content);
            const matchDoc = nlp(conversationHistory[i + 1].content);
            const subtext = await analyzeMessageSubtext(matchDoc);
            const genericNouns = new Set(['thing', 'things', 'point', 'weekend', 'week', 'day', 'bit', 'lot', 'way', 'time', 'place', 'stuff', 'item', 'items', 'object', 'objects', 'article', 'articles', 'entity', 'entities', 'unit', 'units', 'device', 'gadget', 'gear', 'kit', 'tackle', 'hardware', 'goods', 'wares', 'commodity', 'product', 'material', 'substance', 'contraption', 'apparatus', 'equipment', 'paraphernalia', 'junk', 'idea', 'ideas', 'concept', 'concepts', 'notion', 'thought', 'thoughts', 'subject', 'topic', 'matter', 'issue', 'issues', 'concern', 'concerns', 'aspect', 'aspects', 'element', 'elements', 'factor', 'factors', 'case', 'cases', 'deal', 'gist', 'story', 'angle', 'vibe', 'business', 'detail', 'details', 'information', 'info', 'data', 'fact', 'facts', 'news', 'scoop', 'amount', 'quantity', 'number', 'bunch', 'load', 'loads', 'heap', 'heaps', 'pile', 'piles', 'ton', 'tons', 'mass', 'chunk', 'hunk', 'piece', 'pieces', 'portion', 'share', 'slice', 'segment', 'section', 'part', 'parts', 'fraction', 'fragment', 'smidgen', 'tad', 'dash', 'hint', 'touch', 'couple', 'few', 'series', 'set', 'collection', 'array', 'assortment', 'selection', 'variety', 'person', 'people', 'individual', 'individuals', 'character', 'characters', 'guy', 'guys', 'dude', 'dudes', 'chap', 'chaps', 'bloke', 'fellow', 'body', 'bodies', 'soul', 'souls', 'head', 'heads', 'folk', 'folks', 'crowd', 'gang', 'crew', 'squad', 'team', 'party', 'bunch', 'lot', 'situation', 'scenario', 'circumstance', 'circumstances', 'state', 'affair', 'affairs', 'event', 'events', 'happening', 'incident', 'occurrence', 'episode', 'development', 'predicament', 'dilemma', 'problem', 'problems', 'trouble', 'mess', 'jam', 'pickle', 'ordeal', 'experience', 'spot', 'location', 'area', 'zone', 'region', 'site', 'venue', 'joint', 'moment', 'minute', 'second', 'hour', 'period', 'era', 'age', 'while', 'instant', 'jiffy', 'stretch', 'spell', 'thingy', 'thingie', 'thingamajig', 'thingamabob', 'whatchamacallit', 'doodad', 'doohickey', 'gizmo', 'widget', 'whatsit', 'whatnot', 'jawn', 'shit', 'crap', 'bullshit', 'fuckery', 'shitshow', 'clusterfuck', 'fiasco', 'shitstorm', 'mess', 'shitload', 'fuckload', 'assload', 'fuck-ton', 'metric-fuck-ton', 'bastard', 'fucker', 'motherfucker', 'son of a bitch']);
            const potentialTopics = userDoc.nouns().toSingular().out('array').filter(n => !genericNouns.has(n) && n.length > 2);

            if (potentialTopics.length > 0) {
                const scoreChange = subtext.valence + (subtext.arousal * 0.5);
                const matchNouns = new Set(matchDoc.nouns().toSingular().out('array'));

                potentialTopics.forEach(topic => {
                    if (!memory.topics[topic]) {
                        memory.topics[topic] = {
                            score: 0,
                            mentions: 0,
                            lastMentionIndex: 0
                        };
                    }
                    let currentScoreChange = scoreChange;
                    if (matchNouns.has(topic)) {
                        currentScoreChange *= 1.5;
                        DEBUG.log('MEMORY', `Topic "${topic}" confirmed by match, boosting score.`);
                    }
                    memory.topics[topic].score += currentScoreChange;
                    memory.topics[topic].mentions += 1;
                    memory.topics[topic].lastMentionIndex = i;
                });
            }

            if (subtext.intents.includes('reacting_to_humor') && subtext.valence > 0.5) {
                const userSentences = userDoc.sentences();
                const jokeSentence = userSentences.isStatement().last();
                if (jokeSentence.found) {
                    const jokeText = jokeSentence.text('reduced');
                    if (!memory.insideJokes.includes(jokeText)) {
                        memory.insideJokes.push(jokeText);
                        DEBUG.log('MEMORY', 'New inside joke detected and saved.', jokeText);
                    }
                }
            }

            const questionInfo = analyzeQuestion(userDoc);
            if (questionInfo.isQuestion) {
                const questionText = userDoc.text('reduced');
                if (!memory.questionHistory.includes(questionText)) {
                    memory.questionHistory.push(questionText);
                }
            }
        }
    }

    const historyLength = conversationHistory.length;
    for (const topic in memory.topics) {
        if (historyLength - (memory.topics[topic].lastMentionIndex || 0) > 10) {
            memory.topics[topic].score *= 0.9;
        }
        if (memory.topics[topic].score < -1.5 && !memory.avoidedTopics.includes(topic)) {
            memory.avoidedTopics.push(topic);
        }
    }

    const historySubtexts = await Promise.all(conversationHistory.map(msg => analyzeMessageSubtext(nlp(msg.content))));
    const flirtSignalsInHistory = historySubtexts.filter(s => s.intents.includes('flirting_or_sexual')).length;
    const logisticsSignalsInHistory = historySubtexts.filter(s => s.intents.includes('planning')).length;

    if (memory.dateArcPhase === 'rapport' && flirtSignalsInHistory >= 2) {
        memory.dateArcPhase = 'escalation';
        DEBUG.log('MEMORY', 'Date Arc Phase advanced to: escalation');
    }
    if (memory.dateArcPhase === 'escalation' && logisticsSignalsInHistory >= 1) {
        memory.dateArcPhase = 'planning';
        DEBUG.log('MEMORY', 'Date Arc Phase advanced to: planning');
    }

    DEBUG.log('MEMORY', 'Memory update complete.', memory);
    return memory;
}

// ===================================================================================
// SECTION 3: TOP-LEVEL ORCHESTRATOR
// ===================================================================================

/**
 * @param {Message[]} conversationHistory
 * @param {MatchMemory} storedMemory
 * @returns {{updatedMemory: MatchMemory, lastMessageAnalysis: LastMessageAnalysis}}
 */
export async function runFullConversationAnalysis(conversationHistory, storedMemory) {
    DEBUG.log('ANALYSIS', 'Starting full conversation analysis...');
    const updatedMemory = await updateMemoryFromHistory(conversationHistory, storedMemory);
    const lastMessageAnalysis = await analyzeLastMessageForSubtext(conversationHistory);
    DEBUG.log('ANALYSIS', 'Full analysis finished.');
    return {
        updatedMemory,
        lastMessageAnalysis
    };
}

// ===================================================================================
// SECTION 4: HELPER FUNCTIONS
// ===================================================================================

/**
 * @param {Message[]} conversationHistory
 * @returns {ConversationState}
 */
export function determineConversationState(conversationHistory) {
    const messageCount = conversationHistory?.length || 0;
    if (messageCount === 0) {
        DEBUG.log('STATE', 'Determined state: OPENER (no history)');
        return 'OPENER';
    }

    const lastMessage = conversationHistory[messageCount - 1];
    const TWO_DAYS = 24 * 2,
    ONE_WEEK = 24 * 7,
    ONE_MONTH = 24 * 30;

    const hoursSinceMatchReply = calculateHoursSinceMatchReply(conversationHistory);
    const staleGapInHours = calculateStaleConversationGap(conversationHistory);
    let state = 'ACTIVE_CONVO';
    if (lastMessage.role === 'user') {
        if (hoursSinceMatchReply >= ONE_MONTH)
            state = 'REENGAGING_MONTH';
        else if (hoursSinceMatchReply >= ONE_WEEK)
            state = 'REENGAGING_WEEK';
        else if (hoursSinceMatchReply >= TWO_DAYS)
            state = 'REENGAGING_DAY';
    }
    if (lastMessage.role === 'assistant') {
        if (staleGapInHours >= ONE_MONTH)
            state = 'REENGAGING_MONTH';
        else if (staleGapInHours >= ONE_WEEK)
            state = 'REENGAGING_WEEK';
        else if (staleGapInHours >= TWO_DAYS)
            state = 'REENGAGING_DAY';
    }

    if (state === 'ACTIVE_CONVO' && messageCount < 5) {
        state = 'EARLY_CONVO';
    }

    DEBUG.log('STATE', `Determined state: ${state}`, {
        messageCount,
        hoursSinceMatchReply,
        staleGapInHours
    });
    return state;
}
function calculateHoursSinceMatchReply(conversationHistory) {
    const lastMatchMessage = conversationHistory?.filter(msg => msg.role === 'assistant').pop();
    if (!lastMatchMessage || !lastMatchMessage.date)
        return Infinity;
    try {
        return (new Date() - new Date(lastMatchMessage.date)) / (1000 * 60 * 60);
    } catch (e) {
        return Infinity;
    }
}

function calculateStaleConversationGap(conversationHistory) {
    if (!conversationHistory || conversationHistory.length < 2)
        return 0;
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    const secondToLastMessage = conversationHistory[conversationHistory.length - 2];
    if (!lastMessage.date || !secondToLastMessage.date)
        return 0;
    try {
        return (new Date(lastMessage.date) - new Date(secondToLastMessage.date)) / (1000 * 60 * 60);
    } catch (e) {
        return 0;
    }
}

/**
 * @param {object} doc
 * @returns {{isQuestion: boolean, count: number, type: string}}
 */
export function analyzeQuestion(doc) {
    const sentences = doc.sentences();
    if (!sentences.found)
        return {
            isQuestion: false,
            count: 0,
            type: 'none'
        };

    const questionsWithMark = sentences.isQuestion();
    if (questionsWithMark.length > 0) {
        DEBUG.log('QUESTION', 'Question detected by punctuation.', {
            count: questionsWithMark.length
        });
        return {
            isQuestion: true,
            count: questionsWithMark.length,
            type: 'direct'
        };
    }
    const interrogatives = /^(?:what the (?:fuck|hell|heck|actual fuck)|how the (?:fuck|hell)|how (?:come|long|far|much|many|often|old|big|fast|soon|about|else)|what (?:kind|sort|type|time|color|colour|if|about|for|else|part|reason)|which (?:one|way)|(wh(?:at|ere|en|y|ich|o|om|ose))|(are|is|am|was|were|do|does|did|ca|could|will|would|should|have|has|had|may|might|must)n't|(are|is|am|was|were|do|does|did|can|could|will|would|should|have|has|had|may|might|must)|ain't|got a|you (?:sure|kidding|serious)|any (?:chance|idea)|for real|seriously|really|pardon|excuse me|so|and|well|right|yeah|no)\b/i;
    const impliedQuestionPhrases = new Set(['you', 'and you', 'n you', 'u', 'n u', 'yourself', 'and yourself', 'how about you', 'what about you', 'how bout you', 'what bout you', 'and for you', 'for you', 'you guys', 'and you guys', 'you all', 'and you all', 'y\'all', 'and y\'all', 'what about you guys', 'what about y\'all', 'how about you guys', 'how about y\'all', 'what about everyone else', 'and everyone else', 'thoughts', 'opinions', 'and you?', 'correct', 'true', 'innit', 'eh', 'huh', 'you know', ' you see ', ' you feel me ', ' feel me ', 'no way', ' get out ', ' get out of here ', ' stop it ', ' you \' re kidding ', ' you \'re joking', 'wait', 'hold on', 'wait, what', 'say what', 'and then', 'go on', 'and so', 'which means', 'meaning', 'because', 'the fuck', 'what the fuck', 'da fuck', 'tf', 'wtf', 'the hell', 'what the hell', 'wth', 'the actual fuck', 'bullshit', 'bs', 'no fucking way', 'nfw', 'are you fucking serious', 'are you fucking kidding me', 'r u fucking kidding me', ]);
    for (const sentence of sentences.out('array')) {
        if (interrogatives.test(sentence.trim())) {
            DEBUG.log('QUESTION', 'Question detected by interrogative word.', {
                sentence
            });
            return {
                isQuestion: true,
                count: 1,
                type: 'interrogative'
            };
        }
    }

    const processedText = doc.text('reduced');
    if (impliedQuestionPhrases.has(processedText)) {
        DEBUG.log('QUESTION', 'Implied question detected.', {
            originalText: doc.text(),
            processedText: processedText
        });
        return {
            isQuestion: true,
            count: 1,
            type: 'implied'
        };
    }

    return {
        isQuestion: false,
        count: 0,
        type: 'none'
    };
}

export function detectLogisticsSignal(doc) {
    const logisticsVerbs = ['get', 'grab', 'meet', 'hang out', 'do', 'go', 'have', 'catch', 'make', 'take', 'share', 'join', 'come by', 'come over', 'come through', 'drop by', 'stop by', 'swing by', 'head to', 'head over', 'roll through', 'pop in', 'show up', 'make it', 'get to', 'arrive', 'be at', 'get together', 'link up', 'meet up', 'catch up', 'kick it', 'chill', 'vibe', 'connect', 'hit up', 'hit', 'scoop', 'slide', 'post up', 'arrange', 'schedule', 'organize', 'coordinate', 'convene', 'assemble', 'attend', 'gather', 'fuck with', 'mess with', ];
    const logisticsNouns = ['drink', 'drinks', 'coffee', 'dinner', 'lunch', 'brunch', 'breakfast', 'food', 'a meal', 'a bite', 'something to eat', 'tea', 'a beer', 'beers', 'cocktails', 'a round', 'apps', 'a movie', 'the movies', 'a game', 'the game', 'a show', 'a concert', 'a party', 'the party', 'the event', 'the function', 'the move', 'the spot', 'a walk', 'a hike', 'a workout', 'sometime', 'soon', 'later', 'some point', 'at some point', 'one day', 'one of these days', 'in a bit', 'in the future', 'eventually', 'down the road', 'whenever', 'weekend', 'the weekend', 'this weekend', 'next weekend', 'friday', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'fri', 'sat', 'sun', 'mon', 'tues', 'weds', 'thurs', 'tonight', 'tn', 'tomorrow', 'tmrw', 'today', 'the morning', 'morning', 'am', 'the afternoon', 'afternoon', 'pm', 'the evening', 'evening', 'night', 'the night', 'this week', 'next week', 'the week', 'a weekday', 'this month', 'next month', 'the holiday', 'the break', 'later on', 'in an hour', 'my place', 'your place', 'my spot', 'your spot', 'mine', 'yours', 'the bar', 'the cafe', 'the restaurant', 'the club', 'downtown', 'town', ];
    const logisticsQuestions = ['are you free', 'when are you free', 'are you available', 'what\'s your availability', 'you free', 'u free', 'got time', 'got a minute', 'got a sec', 'have time', 'free on', 'free this', 'free for', 'availability?', 'what are you up to', 'busy this week', 'what you up to', 'what are your plans', 'what\'s your plan', 'any plans', 'got plans', 'what you got going on', 'what\'s the plan', 'what\'s your schedule like', 'how\'s your week looking', 'what\'s happening', 'wanna get', 'wanna grab', 'wanna go', 'do you want to', 'want to', 'down for', 'down to', 'up for', 'up to', 'feel like', 'how about', 'what about', 'should we', 'are we getting', 'we still on for', 'care to join', 'wyd', 'wuu2', 'what we doing', 'what we on', 'what\'s good', 'what\'s goodie', 'what\'s the move', 'what\'s the motive', 'you tryna', 'you down', 'u down', 'you with it', 'so, what\'s the plan', 'what the fuck are you up to', 'what the fuck is the plan', 'where the fuck are you', 'where the hell are you', 'what the fuck are we doing', 'are you fucking busy', 'when the fuck are you free', ];
    if (doc.has(logisticsQuestions))
        return true;
    if (doc.verbs().has(logisticsVerbs) && doc.nouns().has(logisticsNouns))
        return true;
    return false;
}

export function isMessageGeoRelated(text) {
    if (!text)
        return false;
    const doc = nlp(text.toLowerCase());
    if (doc.places().found)
        return true;
    const geoTriggers = ['where', 'from', 'at', 'in', 'on', 'near', 'by', 'around', 'to', 'live', 'lives', 'living', 'reside', 'resides', 'residence', 'home', 'hometown', 'homeland', 'based', 'staying', 'grew up', 'born in', 'raised in', 'from', 'native', 'local', 'nationality', 'citizenship', 'roots', 'background', 'travel', 'traveling', 'traveled', 'visit', 'visiting', 'trip', 'vacation', 'holiday', 'journey', 'tour', 'expedition', 'voyage', 'pilgrimage', 'excursion', 'getaway', 'go', 'went', 'going', 'fly', 'flew', 'flying', 'drive', 'drove', 'driving', 'commute', 'commuting', 'relocate', 'relocating', 'move', 'moved', 'moving', 'emigrate', 'immigrate', 'abroad', 'overseas', 'destination', 'itinerary', 'route', 'path', 'country', 'nation', 'state', 'province', 'county', 'city', 'town', 'village', 'municipality', 'district', 'territory', 'capital', 'border', 'continent', 'region', 'area', 'zone', 'hemisphere', 'coast', 'island', 'peninsula', 'mountain', 'valley', 'desert', 'forest', 'jungle', 'ocean', 'sea', 'river', 'lake', 'located', 'location', 'place', 'spot', 'venue', 'site', 'address', 'building', 'office', 'campus', 'headquarters', 'hq', 'airport', 'station', 'port', 'hotel', 'resort', 'park', 'neighborhood', 'suburb', 'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western', 'upstate', 'downstate', 'uptown', 'downtown', 'midtown', 'central', 'remote', 'nearby', 'local', 'distant', 'abroad', 'overseas', 'here', 'there', 'everywhere', 'somewhere', 'anywhere', 'nowhere', 'position', 'coordinates', 'latitude', 'longitude', 'lat', 'long', 'gps', 'map', 'atlas', 'globe', 'directions', 'geography', 'geolocation', 'geotag', 'geofence', 'locale', 'jurisdiction', 'branch', 'outlet', 'market', 'territory', 'shipping', 'delivery', 'origin', 'destination', 'address', 'street', 'road', 'avenue', 'boulevard', 'lane', 'drive', 'court', 'place', 'zip code', 'postal code', 'postcode', 'p.o. box', 'hood', 'neck of the woods', 'stomping grounds', 'turf', 'zone', 'ends', 'area code', 'the sticks', 'the burbs', 'back home', ];
    return doc.has(geoTriggers);
}

function isLowEffortReply(text) {
    if (!text)
        return true;
    const cleanedText = text.trim().toLowerCase();
    if (cleanedText.length < 15)
        return true;
    const lowEffortWords = new Set(['ok', 'okay', 'oki', 'okie', 'k', 'kk', 'kay', 'yep', 'yup', 'yuppers', 'yeah', 'ya', 'yah', 'aight', 'alright', 'alrighty', 'gotcha', 'got it', 'i see', 'isee', 'ah', 'aha', 'understood', 'word', 'lol', 'lolz', 'haha', 'hehe', 'ha', 'he', 'cool', 'nice', 'sweet', 'dope', 'sick', 'lit', 'cute', 'love it', 'amazing', 'awesome', 'thx', 'thanks', 'ty', 'tysm', 'np', 'yw', 'idk', 'idek', 'ofc', 'atm', 'rn', 'fr', 'hbu', 'wbu', 'wyd', 'nm', 'gn', 'gm', 'gl', 'gg', 'lmao', 'lmfao', 'rofl', '👍', '👌', '😂', '❤️', '🔥', '💯', '🙏', '🤣', '😁', '😊', '😉', '💀', '🙂', '✅', '✔️', 'noted', 'copy', 'copy that', 'roger', 'roger that', 'received', 'acknowledged', 'will do', 'sounds good', 'sg', 'sgtm', 'perfect', 'done', 'hmm', 'hm', 'huh', 'oh', 'well', 'fair', 'fair enough', 'true', 'valid', 'i guess', 'i suppose', 'maybe', 'perhaps', 'possibly', '...', 'k.', 'fine.', 'fine', 'whatever', 'w/e', 'sure.', 'sure', 'idc', 'cool.', 'nice.', 'wow.', 'lol.', '.', ]);
    const wordsInText = cleanedText.split(/\s+/);
    return wordsInText.every(word => lowEffortWords.has(word.replace(/[.,!?-]/g, '')));
}

function suggestStyleFromText(text) {
    if (!text)
        return 'playful';
    const doc = nlp(text);
    if (analyzeQuestion(doc).isQuestion)
        return 'direct';
    if (doc.wordCount() < 6)
        return 'witty';
    if (doc.adjectives().length > 3 || doc.wordCount() > 40)
        return 'charming';
    if (doc.has('#Humor') || text.toLowerCase().includes('haha') || text.toLowerCase().includes('lol'))
        return 'playful';
    return 'casual';
}

export function hasRecentGreeting(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0)
        return false;
    const todayDateString = new Date().toISOString().split('T')[0];
    const GREETING_KEYWORDS = ['hey', 'hi', 'hello', 'yo', 'sup', 'hiya', 'heya', 'howdy', 'wassup', 'what up', 'what\'s up', 'greetings', 'salutations', 'aloha', 'ahoy', 'good morning', 'morning', "'morning", 'good afternoon', 'afternoon', 'good evening', 'evening', 'good day', 'how are you', 'how are ya', 'how you doing', 'how you doin', 'how\'s it going', 'hows it going', 'how is it going', 'how have you been', 'how\'s things', 'how\'s life', 'what\'s new', 'what\'s good', 'what\'s goodie', 'what\'s happening', 'what\'s crackin', 'what\'s poppin', 'long time no see', 'nice to see you', 'nice to meet you', 'pleasure to meet you', 'dear', 'to whom it may concern', 'attention', 'welcome', 'gm', 'gn', 'yerrr', 'o/', '\\o', 'hewwo', 'henlo', 'g\'day', 'howzit', 'alright?', 'u alright?', 'wagwan', 'ey up', 'what\'s the craic?', 'cheers', 'hiya pal', 'top of the morning to ya', 'oi', 'psst', 'ahem', 'excuse me', 'yo, asshole', 'hey, fucker', 'sup, bitches', 'look here', 'what do you want', ];
    return conversationHistory.some(msg => {
        if (!msg.date || !msg.date.startsWith(todayDateString))
            return false;
        const firstWord = msg.content.trim().toLowerCase().split(' ')[0].replace(/[.,!?-]/g, '');
        return GREETING_KEYWORDS.includes(firstWord);
    });
}

export function getTimeContext() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    let dayPeriod = hour < 5 ? 'late night' : hour < 8 ? 'early morning' : hour < 12 ? 'morning' : hour < 14 ? 'afternoon' : hour < 17 ? 'late afternoon' : hour < 19 ? 'evening' : hour < 22 ? 'late evening' : 'night';
    if (day === 0 || day === 6 || (day === 5 && hour >= 17)) {
        return `It's the weekend, ${dayName} (${dayPeriod}). You can use a more relaxed, fun-oriented greeting.`;
    }
    if (day >= 1 && day <= 5) {
        return `It's a weekday, ${dayName} - ${dayPeriod}. A casual check-in about their day or a light greeting (e.g., "Happy ${dayName}!") is appropriate.`;
    }
    return null;
}
