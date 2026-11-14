
/* =========================================================
   HEXCLØWN BOT ZONE CORE
   VERSION: 3.0.0
   PART 1: CONFIGURATION, CONNECTION AND AUTHENTICATION
========================================================= */

(function () {
  "use strict";

  if (window["HEXCLØWN"]) {
    console.warn("HEXCLØWN Core is already loaded.");
    return;
  }

  const CONFIG = {
    PROJECT_NAME: "HEXCLØWN",
    VERSION: "3.0.0",

    SUPABASE_URL:
      "https://nddaaqvsnnrdylajpdmp.supabase.co",

    SUPABASE_KEY:
      "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",

    HEALTH_URL:
      "https://nddaaqvsnnrdylajpdmp.supabase.co/functions/v1/hexclown-health",

    TABLES: {
      bots: "hexclown_bots",
      conversations: "hexclown_conversations",
      messages: "hexclown_messages",
      knowledge: "hexclown_knowledge",
      usage: "hexclown_usage"
    }
  };

  let supabaseClient = null;
  let initializationPromise = null;
  let currentUser = null;

  /* =====================================================
     GENERAL HELPERS
  ===================================================== */

  function makeError(message) {
    return new Error(message || "An unexpected error occurred.");
  }

  function throwIfError(error) {
    if (error) {
      console.error("HEXCLØWN:", error);
      throw error;
    }
  }

  function normalizeRows(result) {
    if (Array.isArray(result)) return result;

    if (result && Array.isArray(result.data)) {
      return result.data;
    }

    return [];
  }

  function createId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (character) {
        const random = Math.random() * 16 | 0;

        const value =
          character === "x"
            ? random
            : (random & 3 | 8);

        return value.toString(16);
      }
    );
  }

  function now() {
    return new Date().toISOString();
  }

  /* =====================================================
     SUPABASE LIBRARY LOADER
  ===================================================== */

  function loadLibrary() {
    if (
      window.supabase &&
      typeof window.supabase.createClient === "function"
    ) {
      return Promise.resolve(window.supabase);
    }

    return new Promise(function (resolve, reject) {
      const existing = document.querySelector(
        'script[data-hexclown-supabase="true"]'
      );

      if (existing) {
        existing.addEventListener("load", function () {
          if (window.supabase) {
            resolve(window.supabase);
          } else {
            reject(makeError("Supabase library failed to load."));
          }
        });

        existing.addEventListener("error", function () {
          reject(makeError("Unable to load Supabase library."));
        });

        return;
      }

      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.async = true;
      script.dataset.hexclownSupabase = "true";

      script.onload = function () {
        if (
          window.supabase &&
          typeof window.supabase.createClient === "function"
        ) {
          resolve(window.supabase);
        } else {
          reject(makeError("Supabase library is unavailable."));
        }
      };

      script.onerror = function () {
        reject(makeError("Could not download Supabase library."));
      };

      document.head.appendChild(script);
    });
  }

  /* =====================================================
     DATABASE CONNECTION
  ===================================================== */

  async function db() {
    if (supabaseClient) {
      return supabaseClient;
    }

    const library = await loadLibrary();

    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
      throw makeError("Supabase configuration is incomplete.");
    }

    supabaseClient = library.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "hexclown-auth-session"
        }
      }
    );

    supabaseClient.auth.onAuthStateChange(
      function (event, session) {
        currentUser = session ? session.user : null;

        window.dispatchEvent(
          new CustomEvent("hexclown:auth", {
            detail: {
              event: event,
              session: session,
              user: currentUser
            }
          })
        );
      }
    );

    return supabaseClient;
  }

  /* =====================================================
     AUTHENTICATION
  ===================================================== */

  async function signIn(email, password) {
    if (!email || !password) {
      throw makeError("Email and password are required.");
    }

    const client = await db();

    const {
      data,
      error
    } = await client.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });

    throwIfError(error);

    if (!data || !data.session || !data.user) {
      throw makeError(
        "Authentication succeeded without an active session."
      );
    }

    currentUser = data.user;

    return data;
  }

  async function signOut() {
    const client = await db();

    const {
      error
    } = await client.auth.signOut();

    throwIfError(error);

    currentUser = null;

    return true;
  }

  async function getSession() {
    const client = await db();

    const {
      data,
      error
    } = await client.auth.getSession();

    throwIfError(error);

    if (data && data.session) {
      currentUser = data.session.user;
    } else {
      currentUser = null;
    }

    return data ? data.session : null;
  }

  async function getUser() {
    const client = await db();

    const {
      data,
      error
    } = await client.auth.getUser();

    if (error) {
      currentUser = null;
      return null;
    }

    currentUser = data ? data.user : null;

    return currentUser;
  }

  async function requireUser() {
    const session = await getSession();

    if (!session || !session.user) {
      throw makeError("Auth session missing. Please sign in.");
    }

    const user = await getUser();

    if (!user) {
      throw makeError("Unable to verify your account.");
    }

    return user;
  }

  /* =====================================================
     INITIALIZATION
  ===================================================== */

  async function initialize() {
    if (!initializationPromise) {
      initializationPromise = (async function () {
        await db();

        const session = await getSession();

        if (session && session.user) {
          currentUser = await getUser();
        }

        return {
          success: true,
          user: currentUser,
          authenticated: !!currentUser,
          version: CONFIG.VERSION
        };
      })();
    }

    try {
      return await initializationPromise;
    } catch (error) {
      initializationPromise = null;
      throw error;
    }
  }

  /* =====================================================
     HEALTH CHECK
  ===================================================== */

  async function healthCheck() {
    const response = await fetch(CONFIG.HEALTH_URL, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw makeError("Backend health check failed.");
    }

    return await response.json();
  }

  /* =====================================================
     INTERNAL DATABASE HELPERS
  ===================================================== */

  async function getOwnedRecord(table, id) {
    const client = await db();
    const user = await requireUser();

    const {
      data,
      error
    } = await client
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

    throwIfError(error);

    return data;
  }

  async function listOwnedRecords(table, options) {
    const client = await db();
    const user = await requireUser();

    let query = client
      .from(table)
      .select("*")
      .eq("owner_id", user.id);

    if (options && options.botId) {
      query = query.eq("bot_id", options.botId);
    }

    if (options && options.conversationId) {
      query = query.eq(
        "conversation_id",
        options.conversationId
      );
    }

    const {
      data,
      error
    } = await query.order("created_at", {
      ascending: false
    });

    throwIfError(error);

    return normalizeRows(data);
  }

  console.info(
    "HEXCLØWN CORE PART 1 READY:",
    CONFIG.VERSION
  );

  /* PART 2 WILL CONTINUE HERE */
   
  /* =====================================================
     BOT MANAGEMENT
  ===================================================== */

  const bots = {

    async create(botData = {}) {
      const client = await db();
      const user = await requireUser();

      const record = {
        owner_id: user.id,
        name: botData.name || "New Whisper Bot",
        description: botData.description || "",
        category: botData.category || "other",
        icon: botData.icon || "🤖",
        visibility: botData.visibility || "private",
        personality: botData.personality || "",
        response_style: botData.response_style || "balanced",
        instructions: botData.instructions || "",
        welcome_message: botData.welcome_message || "",
        conversation_starter: botData.conversation_starter || "",
        active: botData.active !== false,
        favorite: botData.favorite === true,
        settings: botData.settings || {},
        created_at: now(),
        updated_at: now()
      };

      const { data, error } = await client
        .from(CONFIG.TABLES.bots)
        .insert(record)
        .select("*")
        .single();

      throwIfError(error);

      return data;
    },

    async list() {
      return await listOwnedRecords(CONFIG.TABLES.bots);
    },

    async get(id) {
      return await getOwnedRecord(CONFIG.TABLES.bots, id);
    },

    async update(id, changes = {}) {
      const client = await db();
      const user = await requireUser();

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

      const updateData = {};

      allowed.forEach(function (key) {
        if (
          Object.prototype.hasOwnProperty.call(changes, key)
        ) {
          updateData[key] = changes[key];
        }
      });

      updateData.updated_at = now();

      const { data, error } = await client
        .from(CONFIG.TABLES.bots)
        .update(updateData)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select("*")
        .single();

      throwIfError(error);

      return data;
    },

    async delete(id) {
      const client = await db();
      const user = await requireUser();

      const { error } = await client
        .from(CONFIG.TABLES.bots)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id);

      throwIfError(error);

      return true;
    },

    async toggleFavorite(id) {
      const bot = await this.get(id);

      if (!bot) {
        throw makeError("Bot not found.");
      }

      return await this.update(id, {
        favorite: !bot.favorite
      });
    },

    async toggleActive(id) {
      const bot = await this.get(id);

      if (!bot) {
        throw makeError("Bot not found.");
      }

      return await this.update(id, {
        active: !bot.active
      });
    }

  };


  /* =====================================================
     CONVERSATION MANAGEMENT
  ===================================================== */

  const conversations = {

    async create(botId, title) {
      const client = await db();
      const user = await requireUser();

      const bot = await bots.get(botId);

      if (!bot) {
        throw makeError("The selected bot does not exist.");
      }

      const record = {
        owner_id: user.id,
        bot_id: bot.id,
        title: title || "New Conversation",
        status: "active",
        created_at: now(),
        updated_at: now()
      };

      const { data, error } = await client
        .from(CONFIG.TABLES.conversations)
        .insert(record)
        .select("*")
        .single();

      throwIfError(error);

      return data;
    },

    async list(botId) {
      const client = await db();
      const user = await requireUser();

      let query = client
        .from(CONFIG.TABLES.conversations)
        .select("*")
        .eq("owner_id", user.id);

      if (botId) {
        query = query.eq("bot_id", botId);
      }

      const { data, error } = await query.order(
        "created_at",
        { ascending: false }
      );

      throwIfError(error);

      return normalizeRows(data);
    },

    async get(id) {
      return await getOwnedRecord(
        CONFIG.TABLES.conversations,
        id
      );
    },

    async update(id, changes = {}) {
      const client = await db();
      const user = await requireUser();

      const updateData = {};

      if (changes.title !== undefined) {
        updateData.title = changes.title;
      }

      if (changes.status !== undefined) {
        updateData.status = changes.status;
      }

      updateData.updated_at = now();

      const { data, error } = await client
        .from(CONFIG.TABLES.conversations)
        .update(updateData)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select("*")
        .single();

      throwIfError(error);

      return data;
    },

    async delete(id) {
      const client = await db();
      const user = await requireUser();

      const { error } = await client
        .from(CONFIG.TABLES.conversations)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id);

      throwIfError(error);

      return true;
    }

  };

  console.info("HEXCLØWN CORE PART 2 READY");
       
  /* =====================================================
     MESSAGE MANAGEMENT
  ===================================================== */

  const messages = {

    async save(conversationId, role, content, metadata = {}) {
      const client = await db();
      const user = await requireUser();

      if (!conversationId || !content) {
        throw makeError("Conversation ID and message content are required.");
      }

      const conversation = await conversations.get(conversationId);

      if (!conversation) {
        throw makeError("Conversation not found.");
      }

      const record = {
        owner_id: user.id,
        conversation_id: conversationId,
        role: role || "user",
        content: String(content),
        metadata: metadata || {},
        created_at: now()
      };

      const { data, error } = await client
        .from(CONFIG.TABLES.messages)
        .insert(record)
        .select("*")
        .single();

      throwIfError(error);

      await conversations.update(conversationId, {
        status: "active"
      });

      return data;
    },

    async list(conversationId) {
      const client = await db();
      const user = await requireUser();

      let query = client
        .from(CONFIG.TABLES.messages)
        .select("*")
        .eq("owner_id", user.id);

      if (conversationId) {
        query = query.eq("conversation_id", conversationId);
      }

      const { data, error } = await query.order(
        "created_at",
        { ascending: true }
      );

      throwIfError(error);

      return normalizeRows(data);
    },

    async delete(id) {
      const client = await db();
      const user = await requireUser();

      const { error } = await client
        .from(CONFIG.TABLES.messages)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id);

      throwIfError(error);

      return true;
    }

  };


  /* =====================================================
     BOT KNOWLEDGE MANAGEMENT
  ===================================================== */

  const knowledge = {

    async add(botId, title, content, metadata = {}) {
      const client = await db();
      const user = await requireUser();

      const bot = await bots.get(botId);

      if (!bot) {
        throw makeError("Bot not found.");
      }

      if (!content) {
        throw makeError("Knowledge content cannot be empty.");
      }

      const record = {
        owner_id: user.id,
        bot_id: botId,
        title: title || "Untitled Knowledge",
        content: String(content),
        source_type: metadata.source_type || "manual",
        metadata: metadata || {},
        created_at: now(),
        updated_at: now()
      };

      const { data, error } = await client
        .from(CONFIG.TABLES.knowledge)
        .insert(record)
        .select("*")
        .single();

      throwIfError(error);

      return data;
    },

    async list(botId) {
      const client = await db();
      const user = await requireUser();

      let query = client
        .from(CONFIG.TABLES.knowledge)
        .select("*")
        .eq("owner_id", user.id);

      if (botId) {
        query = query.eq("bot_id", botId);
      }

      const { data, error } = await query.order(
        "created_at",
        { ascending: false }
      );

      throwIfError(error);

      return normalizeRows(data);
    },

    async delete(id) {
      const client = await db();
      const user = await requireUser();

      const { error } = await client
        .from(CONFIG.TABLES.knowledge)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id);

      throwIfError(error);

      return true;
    }

  };


  /* =====================================================
     USAGE TRACKING
  ===================================================== */

  const usage = {

    async record(recordData = {}) {
      const client = await db();
      const user = await requireUser();

      if (recordData.bot_id) {
        const bot = await bots.get(recordData.bot_id);

        if (!bot) {
          throw makeError("Usage record bot not found.");
        }
      }

      if (recordData.conversation_id) {
        const conversation = await conversations.get(
          recordData.conversation_id
        );

        if (!conversation) {
          throw makeError("Usage record conversation not found.");
        }
      }

      const record = {
        owner_id: user.id,
        bot_id: recordData.bot_id || null,
        conversation_id: recordData.conversation_id || null,
        provider: recordData.provider || "local",
        model: recordData.model || "rule-based",
        request_type: recordData.request_type || "chat",
        input_tokens: Number(recordData.input_tokens || 0),
        output_tokens: Number(recordData.output_tokens || 0),
        created_at: now()
      };

      const { data, error } = await client
        .from(CONFIG.TABLES.usage)
        .insert(record)
        .select("*")
        .single();

      throwIfError(error);

      return data;
    },

    async list(botId) {
      const client = await db();
      const user = await requireUser();

      let query = client
        .from(CONFIG.TABLES.usage)
        .select("*")
        .eq("owner_id", user.id);

      if (botId) {
        query = query.eq("bot_id", botId);
      }

      const { data, error } = await query.order(
        "created_at",
        { ascending: false }
      );

      throwIfError(error);

      return normalizeRows(data);
    },

    async delete(id) {
      const client = await db();
      const user = await requireUser();

      const { error } = await client
        .from(CONFIG.TABLES.usage)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id)
        .select("id");

      throwIfError(error);

      return true;
    }

  };


  /* =====================================================
     ANALYTICS
  ===================================================== */

  const analytics = {

    async overview() {
      await requireUser();

      const results = await Promise.all([
        bots.list(),
        conversations.list(),
        usage.list()
      ]);

      const botRows = normalizeRows(results[0]);
      const conversationRows = normalizeRows(results[1]);
      const usageRows = normalizeRows(results[2]);

      const totalInputTokens = usageRows.reduce(
        (total, item) => total + Number(item.input_tokens || 0),
        0
      );

      const totalOutputTokens = usageRows.reduce(
        (total, item) => total + Number(item.output_tokens || 0),
        0
      );

      return {
        totalBots: botRows.length,

        activeBots: botRows.filter(
          bot => bot.active === true
        ).length,

        favoriteBots: botRows.filter(
          bot => bot.favorite === true
        ).length,

        totalConversations: conversationRows.length,

        totalRequests: usageRows.length,

        totalInputTokens: totalInputTokens,

        totalOutputTokens: totalOutputTokens,

        totalTokens: totalInputTokens + totalOutputTokens
      };
    },

    async bot(botId) {
      const selectedBot = await bots.get(botId);

      if (!selectedBot) {
        throw makeError("Bot not found.");
      }

      const results = await Promise.all([
        conversations.list(botId),
        knowledge.list(botId),
        usage.list(botId)
      ]);

      const conversationRows = normalizeRows(results[0]);
      const knowledgeRows = normalizeRows(results[1]);
      const usageRows = normalizeRows(results[2]);

      return {
        bot: selectedBot,

        totalConversations: conversationRows.length,

        totalKnowledge: knowledgeRows.length,

        totalRequests: usageRows.length,

        totalInputTokens: usageRows.reduce(
          (total, item) => total + Number(item.input_tokens || 0),
          0
        ),

        totalOutputTokens: usageRows.reduce(
          (total, item) => total + Number(item.output_tokens || 0),
          0
        ),

        conversations: conversationRows,

        knowledge: knowledgeRows,

        usage: usageRows
      };
    }

  };

  console.info("HEXCLØWN CORE PART 3 READY");
       
  /* =====================================================
     HEXCLØWN PUBLIC API
  ===================================================== */

  const HEXCLØWN = {

    name: CONFIG.PROJECT_NAME,

    version: CONFIG.VERSION,

    config: {
      project: CONFIG.PROJECT_NAME,
      version: CONFIG.VERSION,
      supabaseUrl: CONFIG.SUPABASE_URL
    },

    /* CONNECTION */

    db: db,

    initialize: initialize,

    healthCheck: healthCheck,

    /* AUTHENTICATION */

    signIn: signIn,

    signOut: signOut,

    getSession: getSession,

    getUser: getUser,

    requireUser: requireUser,

    /* BOT MANAGEMENT */

    bots: bots,

    /* CONVERSATIONS */

    conversations: conversations,

    /* MESSAGES */

    messages: messages,

    /* KNOWLEDGE */

    knowledge: knowledge,

    /* USAGE */

    usage: usage,

    /* ANALYTICS */

    analytics: analytics,

    /* UTILITIES */

    utils: {
      createId: createId,
      now: now,
      normalizeRows: normalizeRows
    },

    /* STATUS */

    get status() {
      return {
        ready: !!supabaseClient,
        authenticated: !!currentUser,
        user: currentUser,
        version: CONFIG.VERSION
      };
    }

  };


  /* =====================================================
     GLOBAL EXPORT
  ===================================================== */

  window["HEXCLØWN"] = HEXCLØWN;


  /* =====================================================
     STARTUP EVENT
  ===================================================== */

  async function startCore() {

    try {

      await db();

      console.info(
        "HEXCLØWN CORE: CONNECTION READY"
      );

      window.dispatchEvent(
        new CustomEvent("hexclown:ready", {
          detail: {
            success: true,
            version: CONFIG.VERSION
          }
        })
      );

    } catch (error) {

      console.error(
        "HEXCLØWN CORE STARTUP ERROR:",
        error
      );

      window.dispatchEvent(
        new CustomEvent("hexclown:error", {
          detail: {
            success: false,
            message: error.message
          }
        })
      );

    }

  }


  startCore();

  console.info(
    "HEXCLØWN BOT ZONE CORE",
    CONFIG.VERSION,
    "LOADED SUCCESSFULLY"
  );

})();
