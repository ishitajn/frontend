export const mockPayload = {
  "matchId": "match_12345",
  "conversation_state": {
    "topics": {
      "focus": ["travel", "food"],
      "avoid": ["politics", "ex-partners"],
      "neutral": ["weather", "work"],
      "sensitive": ["family"],
      "romantic": ["future plans"],
      "fetish": [],
      "sexual": []
    },
    "recent_topics": ["travel", "sushi", "work"]
  },
  "geo": {
    "userLocation": {
      "city_state": "San Francisco, CA",
      "country": "USA",
      "current_time": "2024-08-24T22:50:00Z",
      "time_of_day": "Evening",
      "day_of_week": "Saturday",
      "is_weekend": true,
      "timezone": "America/Los_Angeles"
    },
    "matchLocation": {
      "city_state": "New York, NY",
      "country": "USA",
      "current_time": "2024-08-25T01:50:00Z",
      "time_of_day": "Late Night",
      "day_of_week": "Sunday",
      "is_weekend": true,
      "timezone": "America/New_York"
    },
    "time_difference_hours": 3,
    "distance_km": 4129.0,
    "distance_miles": 2566,
    "is_virtual": false
  },
  "suggestions": {
    "focus": ["Ask about their favorite travel destinations.", "Mention a recent trip you took."],
    "avoid": ["Don't bring up current events.", "Avoid talking about past relationships."],
    "neutral": ["You could ask about their weekend plans."],
    "sensitive": [],
    "romantic": ["Suggest a video call sometime."],
    "fetish": [],
    "sexual": [],
    "topic_shift_recommended": false
  },
  "analysis": {
    "sentiment": "Positive",
    "flirtation_level": "Low",
    "engagement": "High",
    "pace": "Even",
    "power_dynamics": {
      "summary": "Balanced conversation.",
      "user_is_leading": false,
      "power_score": 0.5,
      "details": {
        "user_word_count": 150,
        "match_word_count": 165,
        "user_question_count": 3,
        "match_question_count": 4,
        "user_avg_response_s": 60,
        "match_avg_response_s": 75
      }
    }
  },
  "conversation_analysis": {
    "last_message_from_user": "That sounds amazing! I've always wanted to go to Japan.",
    "last_message_from_match": "You should! The food scene is incredible. Have you had authentic ramen before?",
    "Last_message_from": "match",
    "match_last_message_has_question": true,
    "Match_last_message_geo_context": false,
    "last_user_greeted": false,
    "Last_message_day": "Saturday",
    "greeting_detected": false,
    "flirtation_indicator": false,
    "time_reference_detected": false,
    "location_reference_detected": true,
    "recent_engagement_score": "High",
    "suggest_follow_up_question": true,
    "suggest_flirtation": false,
    "suggest_topic_shift": false,
    "suggest_greeting": false,
    "pace": "Good"
  },
  "pipeline": "production-v2.1"
};
