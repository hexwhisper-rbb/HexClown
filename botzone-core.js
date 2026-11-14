
/* ==========================================
   HEXCLØWN BOT ZONE
   SHARED BACKEND CORE
   PART 1: CONNECTION & AUTHENTICATION
   ========================================== */

(function () {
  "use strict";

  const CONFIG = {
    projectName: "HEXCLØWN",

    supabaseUrl:
      "https://nddaaqvsnnrdylajpdmp.supabase.co",

    supabaseKey:
      "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",

    healthUrl:
      "https://nddaaqvsnnrdylajpdmp.supabase.co/functions/v1/hexclown-health"
  };

  let supabaseClient = null;
  let initialization = null;

  // ------------------------------------------
  // LOAD SUPABASE LIBRARY
  // ------------------------------------------

  function loadSupabaseLibrary() {
    return new Promise(function (resolve, reject) {

      if (
        window.supabase &&
        typeof window.supabase.createClient === "function"
      ) {
        resolve(window.supabase);
        return;
      }

      const existingScript = document.querySelector(
        'script[data-hexclown-supabase="true"]'
      );

      if (existingScript) {
        existingScript.addEventListener(
          "load",
          function () {
            resolve(window.supabase);
          }
        );

        existingScript.addEventListener(
          "error",
          reject
        );

        return;
      }

      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.dataset.hexclownSupabase = "true";

      script.onload = function () {
        if (
          window.supabase &&
          window.supabase.createClient
        ) {
          resolve(window.supabase);
        } else {
          reject(
            new Error("Supabase library failed to initialize.")
          );
        }
      };

      script.onerror = function () {
        reject(
          new Error("Could not load Supabase library. Check your internet connection.")
        );
      };

      document.head.appendChild(script);
    });
  }

  // ------------------------------------------
  // INITIALIZE BACKEND
  // ------------------------------------------

  async function initialize() {

    if (supabaseClient) {
      return supabaseClient;
    }

    if (initialization) {
      return initialization;
    }

    initialization = (async function () {

      const library = await loadSupabaseLibrary();

      supabaseClient = library.createClient(
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

      return supabaseClient;

    })();

    try {
      return await initialization;
    } catch (error) {
      initialization = null;
      throw error;
    }
  }

  // ------------------------------------------
  // AUTHENTICATION
  // ------------------------------------------

  async function getClient() {
    return await initialize();
  }

  async function getSession() {
    const client = await initialize();

    const result = await client.auth.getSession();

    if (result.error) {
      throw result.error;
    }

    return result.data.session;
  }

  async function getUser() {
    const client = await initialize();

    const result = await client.auth.getUser();

    if (result.error) {
      throw result.error;
    }

    return result.data.user;
  }

  async function signIn(email, password) {
    const client = await initialize();

    const result = await client.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }

  async function signOut() {
    const client = await initialize();

    const result = await client.auth.signOut();

    if (result.error) {
      throw result.error;
    }

    return true;
  }

  async function requireUser() {
    const user = await getUser();

    if (!user) {
      throw new Error(
        "Authentication required. Please sign in."
      );
    }

    return user;
  }

  function onAuthChange(callback) {
    if (typeof callback !== "function") {
      throw new Error("A valid callback is required.");
    }

    return initialize().then(function (client) {

      return client.auth.onAuthStateChange(
        function (event, session) {
          callback(event, session);
        }
      );

    });
  }

  // ------------------------------------------
  // BACKEND HEALTH CHECK
  // ------------------------------------------

  async function checkHealth() {

    try {

      const response = await fetch(
        CONFIG.healthUrl,
        {
          method: "GET",
          headers: {
            "Accept": "application/json"
          }
        }
      );

      if (!response.ok) {
        throw new Error(
          "Backend returned HTTP " + response.status
        );
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
  // PUBLIC HEXCLØWN CORE
  // ------------------------------------------

  window.HEXCLØWN = {

    config: CONFIG,

    ready: initialize,

    getClient: getClient,

    auth: {
      getSession: getSession,
      getUser: getUser,
      signIn: signIn,
      signOut: signOut,
      requireUser: requireUser,
      onChange: onAuthChange
    },

    health: {
      check: checkHealth
    }

  };

  // ------------------------------------------
  // INITIALIZATION STATUS
  // ------------------------------------------

  console.log(
    "HEXCLØWN Bot Zone Core loaded."
  );

})();
    
  // ==========================================
  // PART 2: BOT DATABASE MANAGEMENT
  // ==========================================

  const BOT_TABLE = "hexclown_bots";

  function cleanBotData(data) {
    const allowed = [
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

    const cleaned = {};

    allowed.forEach(function (key) {
      if (
        Object.prototype.hasOwnProperty.call(data, key)
      ) {
        cleaned[key] = data[key];
      }
    });

    return cleaned;
  }

  async function createBot(data) {
    const client = await initialize();
    const user = await requireUser();

    if (!data || !data.name || !data.name.trim()) {
      throw new Error("Please enter a bot name.");
    }

    const payload = cleanBotData(data);

    payload.name = payload.name.trim();
    payload.owner_id = user.id;

    const result = await client
      .from(BOT_TABLE)
      .insert(payload)
      .select()
      .single();

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }

  async function getBots(options) {
    const client = await initialize();
    const user = await requireUser();

    options = options || {};

    let query = client
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

    if (result.error) {
      throw result.error;
    }

    return result.data || [];
  }

  async function getBot(botId) {
    const client = await initialize();
    const user = await requireUser();

    if (!botId) {
      throw new Error("Bot ID is required.");
    }

    const result = await client
      .from(BOT_TABLE)
      .select("*")
      .eq("id", botId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }

  async function updateBot(botId, changes) {
    const client = await initialize();
    const user = await requireUser();

    if (!botId) {
      throw new Error("Bot ID is required.");
    }

    const payload = cleanBotData(changes || {});

    payload.updated_at = new Date().toISOString();

    const result = await client
      .from(BOT_TABLE)
      .update(payload)
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select()
      .single();

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }

  async function deleteBot(botId) {
    const client = await initialize();
    const user = await requireUser();

    if (!botId) {
      throw new Error("Bot ID is required.");
    }

    const result = await client
      .from(BOT_TABLE)
      .delete()
      .eq("id", botId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    if (!result.data) {
      throw new Error("Bot not found or access denied.");
    }

    return true;
  }

  async function toggleBotFavorite(botId, favorite) {
    return await updateBot(botId, {
      favorite: Boolean(favorite)
    });
  }

  async function toggleBotActive(botId, active) {
    return await updateBot(botId, {
      active: Boolean(active)
    });
  }

  // ==========================================
  // ADD BOT FUNCTIONS TO PUBLIC CORE
  // ==========================================

  window.HEXCLØWN.bots = {
    create: createBot,
    list: getBots,
    get: getBot,
    update: updateBot,
    delete: deleteBot,
    toggleFavorite: toggleBotFavorite,
    toggleActive: toggleBotActive
  };
    
  // ==========================================
  // PART 3: CONVERSATIONS & MESSAGES
  // ==========================================

  async function createConversation(botId, title) {
    const client = await initialize();
    const user = await requireUser();

    const bot = await getBot(botId);

    if (!bot) {
      throw new Error("Bot not found.");
    }

    const result = await client
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

  async function getConversations(botId) {
    const client = await initialize();
    const user = await requireUser();

    let query = client
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

  async function saveMessage(conversationId, role, content, metadata) {
    const client = await initialize();
    const user = await requireUser();

    const allowedRoles = ["user", "assistant", "system"];

    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid message role.");
    }

    if (!conversationId || !content || !content.trim()) {
      throw new Error("Conversation and message content are required.");
    }

    const result = await client
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

  async function getMessages(conversationId) {
    const client = await initialize();
    const user = await requireUser();

    const result = await client
      .from("hexclown_messages")
      .select("*")
      .eq("owner_id", user.id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (result.error) throw result.error;

    return result.data || [];
  }

  // ==========================================
  // KNOWLEDGE MANAGEMENT
  // ==========================================

  async function addKnowledge(botId, data) {
    const client = await initialize();
    const user = await requireUser();

    const bot = await getBot(botId);

    if (!bot) {
      throw new Error("Bot not found.");
    }

    if (!data || !data.title || !data.title.trim()) {
      throw new Error("Knowledge title is required.");
    }

    const result = await client
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

  async function getKnowledge(botId) {
    const client = await initialize();
    const user = await requireUser();

    let query = client
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
    const client = await initialize();
    const user = await requireUser();

    const result = await client
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

  // ==========================================
  // USAGE TRACKING
  // ==========================================

  async function recordUsage(data) {
    const client = await initialize();
    const user = await requireUser();

    const result = await client
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

  async function getUsage(botId) {
    const client = await initialize();
    const user = await requireUser();

    let query = client
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

  // ==========================================
  // BASIC ANALYTICS
  // ==========================================

  async function getAnalytics(botId) {
    const [bots, conversations, knowledge, usage] =
      await Promise.all([
        getBots(),
        getConversations(botId),
        getKnowledge(botId),
        getUsage(botId)
      ]);

    const selectedBots = botId
      ? bots.filter(function (bot) {
          return bot.id === botId;
        })
      : bots;

    return {
      totalBots: selectedBots.length,
      totalConversations: conversations.length,
      totalKnowledgeEntries: knowledge.length,
      totalRequests: usage.length,
      activeBots: selectedBots.filter(function (bot) {
        return bot.active === true;
      }).length,
      favoriteBots: selectedBots.filter(function (bot) {
        return bot.favorite === true;
      }).length,
      inputTokens: usage.reduce(function (sum, item) {
        return sum + (item.input_tokens || 0);
      }, 0),
      outputTokens: usage.reduce(function (sum, item) {
        return sum + (item.output_tokens || 0);
      }, 0)
    };
  }

  // ==========================================
  // REGISTER FINAL CORE SERVICES
  // ==========================================

  window.HEXCLØWN.conversations = {
    create: createConversation,
    list: getConversations
  };

  window.HEXCLØWN.messages = {
    save: saveMessage,
    list: getMessages
  };

  window.HEXCLØWN.knowledge = {
    add: addKnowledge,
    list: getKnowledge,
    delete: deleteKnowledge
  };

  window.HEXCLØWN.usage = {
    record: recordUsage,
    list: getUsage
  };

  window.HEXCLØWN.analytics = {
    get: getAnalytics
  };

  console.log("HEXCLØWN Bot Zone Core fully registered.");
      
