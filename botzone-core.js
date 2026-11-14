
/* ============================================
   HEXCLØWN BOT ZONE
   SHARED BACKEND CORE
   VERSION 1.0
   ============================================ */

(function () {
  "use strict";

  // ------------------------------------------
  // 1. CONFIGURATION
  // ------------------------------------------

  const CONFIG = {
    projectName: "HEXCLØWN",

    supabaseUrl:
      "https://nddaaqvsnnrdylajpdmp.supabase.co",

    supabaseKey:
      "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",

    healthUrl:
      "https://nddaaqvsnnrdylajpdmp.supabase.co/functions/v1/hexclown-health"
  };

  let client = null;
  let initialization = null;

  // ------------------------------------------
  // 2. LOAD SUPABASE
  // ------------------------------------------

  function loadLibrary() {
    return new Promise(function (resolve, reject) {

      if (
        window.supabase &&
        window.supabase.createClient
      ) {
        resolve(window.supabase);
        return;
      }

      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.onload = function () {
        if (
          window.supabase &&
          window.supabase.createClient
        ) {
          resolve(window.supabase);
        } else {
          reject(new Error("Supabase library unavailable."));
        }
      };

      script.onerror = function () {
        reject(new Error("Could not load Supabase library."));
      };

      document.head.appendChild(script);
    });
  }

  async function initialize() {

    if (client) return client;

    if (initialization) return initialization;

    initialization = (async function () {

      const library = await loadLibrary();

      client = library.createClient(
        CONFIG.supabaseUrl,
        CONFIG.supabaseKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );

      return client;

    })();

    try {
      return await initialization;
    } catch (error) {
      initialization = null;
      throw error;
    }
  }

  // ------------------------------------------
  // 3. AUTHENTICATION
  // ------------------------------------------

  async function getUser() {
    const db = await initialize();

    const result = await db.auth.getUser();

    if (result.error) throw result.error;

    return result.data.user;
  }

  async function getSession() {
    const db = await initialize();

    const result = await db.auth.getSession();

    if (result.error) throw result.error;

    return result.data.session;
  }

  async function requireUser() {
    const user = await getUser();

    if (!user) {
      throw new Error("Please sign in first.");
    }

    return user;
  }

  async function signIn(email, password) {
    const db = await initialize();

    const result = await db.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (result.error) throw result.error;

    return result.data;
  }

  async function signOut() {
    const db = await initialize();

    const result = await db.auth.signOut();

    if (result.error) throw result.error;

    return true;
  }

  async function onAuthChange(callback) {
    const db = await initialize();

    return db.auth.onAuthStateChange(callback);
  }

  // ------------------------------------------
  // 4. BACKEND HEALTH
  // ------------------------------------------

  async function checkHealth() {
    try {
      const response = await fetch(CONFIG.healthUrl);

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();

      return {
        online: data.success === true,
        status: data.status || "unknown",
        message: data.message || "Health check completed.",
        data: data
      };

    } catch (error) {
      return {
        online: false,
        status: "offline",
        message: error.message,
        data: null
      };
    }
  }

  // ------------------------------------------
  // 5. BOT MANAGEMENT
  // ------------------------------------------

  const BOT_TABLE = "hexclown_bots";

  const BOT_FIELDS = [
    "name",
    "description",
    "category",
    "icon",
    "visibility",
    "personality",
    "response_style",
    "instructions",
    "welcome_message",
    "conversation_starter",
    "active",
    "favorite",
    "settings"
  ];

  function cleanBotData(data) {
    const cleaned = {};

    BOT_FIELDS.forEach(function (field) {
      if (
        Object.prototype.hasOwnProperty.call(data, field)
      ) {
        cleaned[field] = data[field];
      }
    });

    return cleaned;
  }

  async function createBot(data) {
    const db = await initialize();
    const user = await requireUser();

    if (!data || !data.name || !data.name.trim()) {
      throw new Error("Bot name is required.");
    }

    const payload = cleanBotData(data);

    payload.name = payload.name.trim();
    payload.owner_id = user.id;

    const result = await db
      .from(BOT_TABLE)
      .insert(payload)
      .select()
      .single();

    if (result.error) throw result.error;

    return result.data;
  }

  async function listBots(options) {
    const db = await initialize();
    const user = await requireUser();

    options = options || {};

    let query = db
      .from(BOT_TABLE)
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (options.active === true) {
      query = query.eq("active", true);
    }

    if (options.favorite === true) {
      query = query.eq("favorite", true);
    }

    if (options.category) {
      query = query.eq("category", options.category);
    }

    const result = await query;

    if (result.error) throw result.error;

    return result.data || [];
  }

  async function getBot(botId) {
    const db = await initialize();
    const user = await requireUser();

    const result = await db
      .from(BOT_TABLE)
      .select("*")
      .eq("id", botId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (result.error) throw result.error;

    return result.data;
  }

  async function updateBot(botId, changes) {
    const db = await initialize();
    const user = await requireUser();

    const payload = cleanBotData(changes || {});

    if (Object.keys(payload).length === 0) {
      throw new Error("No valid changes supplied.");
    }

    payload.updated_at = new Date().toISOString();

    const result = await db
      .from(BOT_TABLE)
      .update(payload)
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select()
      .single();

    if (result.error) throw result.error;

    return result.data;
  }

  async function deleteBot(botId) {
    const db = await initialize();
    const user = await requireUser();

    const result = await db
      .from(BOT_TABLE)
      .delete()
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (result.error) throw result.error;

    if (!result.data) {
      throw new Error("Bot not found or access denied.");
    }

    return true;
  }

  async function toggleFavorite(botId, value) {
    return updateBot(botId, {
      favorite: Boolean(value)
    });
  }

  async function toggleActive(botId, value) {
    return updateBot(botId, {
      active: Boolean(value)
    });
  }

  // ------------------------------------------
  // 6. CONVERSATIONS
  // ------------------------------------------

  async function createConversation(botId, title) {
    const db = await initialize();
    const user = await requireUser();

    const bot = await getBot(botId);

    if (!bot) {
      throw new Error("Bot not found.");
    }

    const result = await db
      .from("hexclown_conversations")
      .insert({
        owner_id: user.id,
        bot_id: botId,
        title: title || "New conversation",
        status: "active"
      })
      .select()
      .single();

    if (result.error) throw result.error;

    return result.data;
  }

  async function listConversations(botId) {
    const db = await initialize();
    const user = await requireUser();

    let query = db
      .from("hexclown_conversations")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (botId) {
      query = query.eq("bot_id", botId);
    }

    const result = await query;

    if (result.error) throw result.error;

    return result.data || [];
  }

  // ------------------------------------------
  // 7. MESSAGE MANAGEMENT
  // ------------------------------------------

  async function saveMessage(
    conversationId,
    role,
    content,
    metadata
  ) {
    const db = await initialize();
    const user = await requireUser();

    const allowedRoles = [
      "user",
      "assistant",
      "system"
    ];

    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid message role.");
    }

    if (
      !conversationId ||
      !content ||
      !content.trim()
    ) {
      throw new Error("Conversation and content are required.");
    }

    // Verify conversation ownership first.
    const conversation = await db
      .from("hexclown_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (conversation.error) throw conversation.error;

    if (!conversation.data) {
      throw new Error("Conversation not found.");
    }

    const result = await db
      .from("hexclown_messages")
      .insert({
        owner_id: user.id,
        conversation_id: conversationId,
        role: role,
        content: content.trim(),
        metadata: metadata || {}
      })
      .select()
      .single();

    if (result.error) throw result.error;

    return result.data;
  }

  async function listMessages(conversationId) {
    const db = await initialize();
    const user = await requireUser();

    const result = await db
      .from("hexclown_messages")
      .select("*")
      .eq("owner_id", user.id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (result.error) throw result.error;

    return result.data || [];
  }

  // ------------------------------------------
  // 8. KNOWLEDGE MANAGEMENT
  // ------------------------------------------

  async function addKnowledge(botId, data) {
    const db = await initialize();
    const user = await requireUser();

    const bot = await getBot(botId);

    if (!bot) {
      throw new Error("Bot not found.");
    }

    if (!data || !data.title || !data.title.trim()) {
      throw new Error("Knowledge title is required.");
    }

    const result = await db
      .from("hexclown_knowledge")
      .insert({
        owner_id: user.id,
        bot_id: botId,
        title: data.title.trim(),
        content: data.content || "",
        source_type: data.source_type || "manual",
        metadata: data.metadata || {}
      })
      .select()
      .single();

    if (result.error) throw result.error;

    return result.data;
  }

  async function listKnowledge(botId) {
    const db = await initialize();
    const user = await requireUser();

    let query = db
      .from("hexclown_knowledge")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (botId) {
      query = query.eq("bot_id", botId);
    }

    const result = await query;

    if (result.error) throw result.error;

    return result.data || [];
  }

  async function deleteKnowledge(knowledgeId) {
    const db = await initialize();
    const user = await requireUser();

    const result = await db
      .from("hexclown_knowledge")
      .delete()
      .eq("id", knowledgeId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (result.error) throw result.error;

    if (!result.data) {
      throw new Error("Knowledge entry not found.");
    }

    return true;
  }

  // ------------------------------------------
  // 9. USAGE TRACKING
  // ------------------------------------------

  async function recordUsage(data) {
    const db = await initialize();
    const user = await requireUser();

    data = data || {};

    const result = await db
      .from("hexclown_usage")
      .insert({
        owner_id: user.id,
        bot_id: data.bot_id || null,
        conversation_id: data.conversation_id || null,
        provider: data.provider || "local",
        model: data.model || "rule-based",
        request_type: data.request_type || "chat",
        input_tokens: Number(data.input_tokens || 0),
        output_tokens: Number(data.output_tokens || 0)
      })
      .select()
      .single();

    if (result.error) throw result.error;

    return result.data;
  }

  async function listUsage(botId) {
    const db = await initialize();
    const user = await requireUser();

    let query = db
      .from("hexclown_usage")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (botId) {
      query = query.eq("bot_id", botId);
    }

    const result = await query;

    if (result.error) throw result.error;

    return result.data || [];
  }

  // ------------------------------------------
  // 10. ANALYTICS
  // ------------------------------------------

  async function getAnalytics(botId) {
    const bots = await listBots();
    const conversations = await listConversations(botId);
    const knowledge = await listKnowledge(botId);
    const usage = await listUsage(botId);

    const selectedBots = botId
      ? bots.filter(function (bot) {
          return bot.id === botId;
        })
      : bots;

    return {
      totalBots: selectedBots.length,

      activeBots: selectedBots.filter(function (bot) {
        return bot.active === true;
      }).length,

      favoriteBots: selectedBots.filter(function (bot) {
        return bot.favorite === true;
      }).length,

      totalConversations: conversations.length,

      totalKnowledgeEntries: knowledge.length,

      totalRequests: usage.length,

      inputTokens: usage.reduce(function (sum, item) {
        return sum + (item.input_tokens || 0);
      }, 0),

      outputTokens: usage.reduce(function (sum, item) {
        return sum + (item.output_tokens || 0);
      }, 0)
    };
  }

  // ------------------------------------------
  // 11. PUBLIC HEXCLØWN API
  // ------------------------------------------

  window.HEXCLØWN = {

    config: CONFIG,

    ready: initialize,

    getClient: initialize,

    auth: {
      getUser: getUser,
      getSession: getSession,
      requireUser: requireUser,
      signIn: signIn,
      signOut: signOut,
      onChange: onAuthChange
    },

    health: {
      check: checkHealth
    },

    bots: {
      create: createBot,
      list: listBots,
      get: getBot,
      update: updateBot,
      delete: deleteBot,
      toggleFavorite: toggleFavorite,
      toggleActive: toggleActive
    },

    conversations: {
      create: createConversation,
      list: listConversations
    },

    messages: {
      save: saveMessage,
      list: listMessages
    },

    knowledge: {
      add: addKnowledge,
      list: listKnowledge,
      delete: deleteKnowledge
    },

    usage: {
      record: recordUsage,
      list: listUsage
    },

    analytics: {
      get: getAnalytics
    }

  };

  console.log(
    "HEXCLØWN Bot Zone Core initialized."
  );

})();
       
