
/* ==========================================
   HEXCLØWN RESPONSE ENGINE
   Version: 1.0.0
   Rule-based response system
========================================== */

(function () {
  "use strict";

  const HEXResponseEngine = {

    version: "1.0.0",

    generate: function (options) {
      options = options || {};

      const bot = options.bot || {};
      const message = String(options.message || "").trim();
      const history = Array.isArray(options.history)
        ? options.history
        : [];

      if (!message) {
        return {
          success: false,
          text: "Please type a message first."
        };
      }

      const name = bot.name || "Your bot";
      const personality = String(bot.personality || "friendly").toLowerCase();
      const style = String(bot.response_style || "conversational").toLowerCase();
      const instructions = String(bot.instructions || "").trim();

      const clean = message.toLowerCase()
        .replace(/[^\w\s']/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const contains = function (words) {
        return words.some(function (word) {
          return clean.includes(word);
        });
      };

      const previousUserMessage = history
        .filter(function (item) {
          return item && item.role === "user";
        })
        .slice(-2, -1)[0];

      let response = "";
      let intent = "general";

      // GREETINGS
      if (/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)\b/.test(clean)) {
        intent = "greeting";

        const greetings = [
          "Hello! What would you like to talk about?",
          "Hey! I'm here. What's on your mind?",
          "Hi there! How can I help you today?"
        ];

        response = greetings[Math.floor(Math.random() * greetings.length)];
      }

      // IDENTITY
      else if (
        contains(["who are you", "your name", "what are you", "introduce yourself"])
      ) {
        intent = "identity";
        response = "I'm " + name + ". I'm here to chat and help using the personality and instructions I've been given.";
      }

      // BOT'S CREATOR
      else if (
        contains(["who created you", "who made you", "your creator"])
      ) {
        intent = "creator";
        response = "I was created using the HEXCLØWN Bot Zone.";
      }

      // HOW ARE YOU
      else if (
        contains(["how are you", "how are things", "how is it going"])
      ) {
        intent = "wellbeing";
        response = "I'm ready to chat! How are things going with you?";
      }

      // THANKS
      else if (
        contains(["thank you", "thanks", "appreciate it"])
      ) {
        intent = "thanks";
        response = "You're welcome! Happy to help.";
      }

      // GOODBYE
      else if (
        contains(["bye", "goodbye", "see you later", "gotta go"])
      ) {
        intent = "goodbye";
        response = "It was nice chatting with you. See you next time!";
      }

      // HELP
      else if (
        contains(["help me", "can you help", "i need help"])
      ) {
        intent = "help";
        response = "Of course. Tell me what you need help with, and we'll take it one step at a time.";
      }

      // JOKES
      else if (
        contains(["tell me a joke", "make me laugh", "say something funny"])
      ) {
        intent = "joke";
        response = "Why did the computer go to the doctor? Because it had a virus!";
      }

      // FEELINGS
      else if (
        contains(["i am sad", "i feel sad", "i am stressed", "i feel lonely", "bad day"])
      ) {
        intent = "support";
        response = "I'm sorry things feel difficult right now. You can tell me what's happening, and I'll listen.";
      }

      // FAVOURITES
      else if (
        contains(["what do you like", "your favourite", "your favorite"])
      ) {
        intent = "preferences";
        response = "I don't have personal favourites like a human, but I can discuss different interests with you.";
      }

      // SIMPLE MATH
      else if (/^what is \d+\s*[\+\-x*]\s*\d+\??$/.test(clean)) {
        intent = "math";

        const match = clean.match(/(\d+)\s*([\+\-x*])\s*(\d+)/);

        if (match) {
          const a = Number(match[1]);
          const b = Number(match[3]);
          const operator = match[2];

          let answer;

          if (operator === "+") answer = a + b;
          if (operator === "-") answer = a - b;
          if (operator === "x" || operator === "*") answer = a * b;

          response = "The answer is " + answer + ".";
        }
      }

      // FOLLOW-UP
      else if (
        contains(["tell me more", "explain more", "continue", "go on"])
      ) {
        intent = "followup";

        if (previousUserMessage) {
          response = "Let's continue discussing: \"" +
            String(previousUserMessage.content || "").slice(0, 120) +
            "\". What part would you like to explore further?";
        } else {
          response = "Sure! What would you like me to explain further?";
        }
      }

      // PERSONALITY-BASED FALLBACK
      else {
        intent = "general";

        if (
          personality.includes("funny") ||
          personality.includes("humorous")
        ) {
          response = "Interesting! Now you've got my attention. Tell me more!";
        }

        else if (
          personality.includes("professional") ||
          personality.includes("formal")
        ) {
          response = "Thank you for sharing that. Could you provide a little more detail so I can respond appropriately?";
        }

        else if (
          personality.includes("wise") ||
          personality.includes("mentor")
        ) {
          response = "That's worth thinking about. Let's look at it carefully. Can you explain a little more?";
        }

        else if (
          personality.includes("creative")
        ) {
          response = "That's an interesting idea! There's plenty we could explore from here. Tell me more.";
        }

        else {
          response = "I hear you. Could you tell me a little more so I can give you a useful response?";
        }
      }

      // RESPONSE STYLE
      if (style.includes("short") && response.length > 100) {
        response = response.split(".")[0] + ".";
      }

      if (
        style.includes("friendly") &&
        intent !== "goodbye" &&
        !response.includes("!")
      ) {
        response += "!";
      }

      // Saved instructions are retained as bot configuration.
      // Arbitrary natural-language instructions are not interpreted
      // as executable rules by this basic engine.

      return {
        success: true,
        text: response,
        intent: intent,
        bot: name,
        engine: "HEXCLØWN Rule Engine " + this.version
      };
    }
  };

  window.HEXResponseEngine = HEXResponseEngine;

})();
