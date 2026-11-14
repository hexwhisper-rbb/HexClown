(function () {
  "use strict";

  // ==========================================
  // HEXCLØWN BOT ZONE CORE
  // VERSION 4.1.0
  // ==========================================

  const CONFIG = {
    VERSION: "4.1.0",

    SUPABASE_URL:
      "https://nddaaqvsnnrdylajpdmp.supabase.co",

    SUPABASE_KEY:
      "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",

    HEALTH_URL:
      "https://nddaaqvsnnrdylajpdmp.supabase.co/functions/v1/hexclown-health",

    TABLES: {
      BOTS: "hexclown_bots",
      CONVERSATIONS: "hexclown_conversations",
      MESSAGES: "hexclown_messages",
      KNOWLEDGE: "hexclown_knowledge",
      USAGE: "hexclown_usage"
    }
  };

  // ==========================================
  // INTERNAL STATE
  // ==========================================

  let supabaseClient = null;
  let libraryPromise = null;
  let currentUser = null;

  // ==========================================
  // ERROR HANDLING
  // ==========================================

  function makeError(message, originalError) {
    const error = new Error(message);

    if (originalError) {
      error.originalError = originalError;
      error.code = originalError.code || null;
    }

    return error;
  }

  function throwIfError(result) {
    if (result && result.error) {
      throw makeError(
        result.error.message || "Database operation failed.",
        result.error
      );
    }

    return result;
  }

  function normalizeRows(data) {
    if (!data) return [];

    return Array.isArray(data) ? data : [data];
  }

  // ==========================================
  // GENERAL HELPERS
  // ==========================================

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

  function dispatchEvent(name, detail) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: detail || {}
        })
      );
    } catch (error) {
      console.warn(
        "HEXCLØWN event error:",
        error
      );
    }
  }

  function requireValue(value, name) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      throw makeError(name + " is required.");
    }

    return value;
  }

  // ==========================================
  // LOAD SUPABASE LIBRARY
  // ==========================================

  function loadLibrary() {
    if (
      window.supabase &&
      typeof window.supabase.createClient === "function"
    ) {
      return Promise.resolve(window.supabase);
    }

    if (!libraryPromise) {
      libraryPromise = new Promise(function (
        resolve,
        reject
      ) {
        const script = document.createElement("script");

        script.src =
          "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.async = true;

        script.onload = function () {
          if (
            window.supabase &&
            typeof window.supabase.createClient === "function"
          ) {
            resolve(window.supabase);
          } else {
            libraryPromise = null;

            reject(
              makeError(
                "Supabase library loaded incorrectly."
              )
            );
          }
        };

        script.onerror = function () {
          libraryPromise = null;

          reject(
            makeError(
              "Could not load Supabase. Check your internet connection."
            )
          );
        };

        document.head.appendChild(script);
      });
    }

    return libraryPromise;
  }

  // ==========================================
  // DATABASE CONNECTION
  // ==========================================

  async function db() {
    if (supabaseClient) {
      return supabaseClient;
    }

    const library = await loadLibrary();

    supabaseClient = library.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    return supabaseClient;
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  async function getSession() {
    const client = await db();

    const result = await client.auth.getSession();

    throwIfError(result);

    return result.data.session || null;
  }

  async function getUser() {
    const client = await db();

    const result = await client.auth.getUser();

    throwIfError(result);

    currentUser = result.data.user || null;

    return currentUser;
  }

  async function requireUser() {
    const session = await getSession();

    if (!session || !session.user) {
      currentUser = null;

      throw makeError(
        "You must sign in to use HEXCLØWN Bot Zone."
      );
    }

    currentUser = session.user;

    return currentUser;
  }

  async function signIn(email, password) {
    requireValue(email, "Email");
    requireValue(password, "Password");

    const client = await db();

    const result = await client.auth.signInWithPassword({
      email: String(email).trim(),
      password: String(password)
    });

    throwIfError(result);

    currentUser = result.data.user || null;

    dispatchEvent("hex:signin", {
      user: currentUser
    });

    return {
      success: true,
      user: currentUser,
      session: result.data.session
    };
  }

  async function signOut() {
    const client = await db();

    const result = await client.auth.signOut();

    throwIfError(result);

    currentUser = null;

    dispatchEvent("hex:signout", {});

    return {
      success: true
    };
  }

  async function initialize() {
    await db();

    const session = await getSession();

    if (session && session.access_token) {
      currentUser = await getUser();
    } else {
      currentUser = null;
    }

    return {
      success: true,
      authenticated: !!currentUser,
      user: currentUser,
      version: CONFIG.VERSION
    };
  }

  // ==========================================
  // BACKEND HEALTH CHECK
  // ==========================================

  async function healthCheck() {
    const response = await fetch(
      CONFIG.HEALTH_URL,
      {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw makeError(
        "HEXCLØWN backend health check failed."
      );
    }

    return await response.json();
  }

  // ==========================================
  // OWNERSHIP HELPERS
  // ==========================================

  async function getOwnedRecord(table, id) {
    requireValue(id, "Record ID");

    const user = await requireUser();
    const client = await db();

    const result = await client
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

    throwIfError(result);

    return result.data || null;
  }

  async function listOwnedRecords(
    table,
    filters
  ) {
    const user = await requireUser();
    const client = await db();

    let query = client
      .from(table)
      .select("*")
      .eq("owner_id", user.id);

    if (filters) {
      Object.keys(filters).forEach(function (key) {
        if (
          filters[key] !== undefined &&
          filters[key] !== null
        ) {
          query = query.eq(key, filters[key]);
        }
      });
    }

    const result = await query.order(
      "created_at",
      {
        ascending: false
      }
    );

    throwIfError(result);

    return normalizeRows(result.data);
  }

  // ==========================================
  // BOT MANAGEMENT
  // ==========================================

  const bots = {

    async create(data) {
      requireValue(data, "Bot information");

      const user = await requireUser();
      const client = await db();

      const record = {
        owner_id: user.id,
        name: String(data.name || "New Bot").trim(),
        description: data.description || "",
        category: data.category || "General",
        icon: data.icon || "🤖",
        visibility: data.visibility || "private",
        personality: data.personality || "",
        response_style: data.response_style || "friendly",
        instructions: data.instructions || "",
        welcome_message: data.welcome_message || "",
        conversation_starter:
          data.conversation_starter || "",
        active:
          data.active !== undefined
            ? !!data.active
            : true,
        favorite: !!data.favorite,
        settings: data.settings || {},
        created_at: now(),
        updated_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.BOTS)
        .insert(record)
        .select()
        .single();

      throwIfError(result);

      return result.data;
    },

    async list() {
      return await listOwnedRecords(
        CONFIG.TABLES.BOTS
      );
    },

    async get(id) {
      return await getOwnedRecord(
        CONFIG.TABLES.BOTS,
        id
      );
    },

    async update(id, changes) {
      requireValue(id, "Bot ID");
      requireValue(changes, "Bot changes");

      const user = await requireUser();
      const client = await db();

      const record = Object.assign(
        {},
        changes,
        {
          owner_id: user.id,
          updated_at: now()
        }
      );

      delete record.id;
      delete record.created_at;

      const result = await client
        .from(CONFIG.TABLES.BOTS)
        .update(record)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select()
        .single();

      throwIfError(result);

      return result.data;
    },

    async delete(id) {
      requireValue(id, "Bot ID");

      const user = await requireUser();
      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.BOTS)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id)
        .select();

      throwIfError(result);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
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

  // ==========================================
  // CONVERSATION MANAGEMENT
  // ==========================================

  const conversations = {

    async create(data) {
      requireValue(data, "Conversation information");

      const user = await requireUser();
      const client = await db();

      const record = {
        owner_id: user.id,
        bot_id: requireValue(data.bot_id, "Bot ID"),
        title: data.title || "New conversation",
        status: data.status || "active",
        created_at: now(),
        updated_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.CONVERSATIONS)
        .insert(record)
        .select()
        .single();

      throwIfError(result);

      return result.data;
    },

    async list(botId) {
      const filters = {};

      if (botId) {
        filters.bot_id = botId;
      }

      return await listOwnedRecords(
        CONFIG.TABLES.CONVERSATIONS,
        filters
      );
    },

    async get(id) {
      return await getOwnedRecord(
        CONFIG.TABLES.CONVERSATIONS,
        id
      );
    },

    async update(id, changes) {
      requireValue(id, "Conversation ID");
      requireValue(changes, "Conversation changes");

      const user = await requireUser();
      const client = await db();

      const record = Object.assign(
        {},
        changes,
        {
          owner_id: user.id,
          updated_at: now()
        }
      );

      delete record.id;
      delete record.created_at;

      const result = await client
        .from(CONFIG.TABLES.CONVERSATIONS)
        .update(record)
        .eq("id", id)
        .eq("owner_id", user.id)
        .select()
        .single();

      throwIfError(result);

      return result.data;
    },

    async delete(id) {
      requireValue(id, "Conversation ID");

      const user = await requireUser();
      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.CONVERSATIONS)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id)
        .select();

      throwIfError(result);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }

  };  // ==========================================
  // MESSAGE MANAGEMENT
  // ==========================================

  const messages = {

    async save(data) {
      requireValue(data, "Message information");

      const user = await requireUser();
      const client = await db();

      const record = {
        owner_id: user.id,
        conversation_id: requireValue(
          data.conversation_id,
          "Conversation ID"
        ),
        role: data.role || "user",
        content: String(data.content || ""),
        metadata: data.metadata || {},
        created_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.MESSAGES)
        .insert(record)
        .select()
        .single();

      throwIfError(result);

      return result.data;
    },

    async list(conversationId) {
      requireValue(conversationId, "Conversation ID");

      const user = await requireUser();
      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.MESSAGES)
        .select("*")
        .eq("owner_id", user.id)
        .eq("conversation_id", conversationId)
        .order("created_at", {
          ascending: true
        });

      throwIfError(result);

      return normalizeRows(result.data);
    },

    async delete(id) {
      requireValue(id, "Message ID");

      const user = await requireUser();
      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.MESSAGES)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id)
        .select();

      throwIfError(result);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }

  };


  // ==========================================
  // KNOWLEDGE MANAGEMENT
  // ==========================================

  const knowledge = {

    async add(data) {
      requireValue(data, "Knowledge information");

      const user = await requireUser();
      const client = await db();

      const record = {
        owner_id: user.id,
        bot_id: requireValue(data.bot_id, "Bot ID"),
        title: data.title || "Untitled knowledge",
        content: String(data.content || ""),
        source_type: data.source_type || "manual",
        metadata: data.metadata || {},
        created_at: now(),
        updated_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.KNOWLEDGE)
        .insert(record)
        .select()
        .single();

      throwIfError(result);

      return result.data;
    },

    async list(botId) {
      requireValue(botId, "Bot ID");

      return await listOwnedRecords(
        CONFIG.TABLES.KNOWLEDGE,
        {
          bot_id: botId
        }
      );
    },

    async delete(id) {
      requireValue(id, "Knowledge ID");

      const user = await requireUser();
      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.KNOWLEDGE)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id)
        .select();

      throwIfError(result);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }

  };


  // ==========================================
  // USAGE TRACKING
  // ==========================================

  const usage = {

    async record(data) {
      requireValue(data, "Usage information");

      const user = await requireUser();
      const client = await db();

      const record = {
        owner_id: user.id,
        bot_id: data.bot_id || null,
        conversation_id: data.conversation_id || null,
        provider: data.provider || "internal",
        model: data.model || "rule-based",
        request_type: data.request_type || "chat",
        input_tokens: Number(data.input_tokens || 0),
        output_tokens: Number(data.output_tokens || 0),
        created_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.USAGE)
        .insert(record)
        .select()
        .single();

      throwIfError(result);

      return result.data;
    },

    async list(botId) {
      const filters = {};

      if (botId) {
        filters.bot_id = botId;
      }

      return await listOwnedRecords(
        CONFIG.TABLES.USAGE,
        filters
      );
    },

    async delete(id) {
      requireValue(id, "Usage ID");

      const user = await requireUser();
      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.USAGE)
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id)
        .select();

      throwIfError(result);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }

  };


  // ==========================================
  // ANALYTICS
  // ==========================================

  const analytics = {

    async overview() {
      const user = await requireUser();
      const client = await db();

      const tables = [
        CONFIG.TABLES.BOTS,
        CONFIG.TABLES.CONVERSATIONS,
        CONFIG.TABLES.MESSAGES,
        CONFIG.TABLES.KNOWLEDGE,
        CONFIG.TABLES.USAGE
      ];

      const counts = await Promise.all(
        tables.map(async function (table) {
          const result = await client
            .from(table)
            .select("id", {
              count: "exact",
              head: true
            })
            .eq("owner_id", user.id);

          throwIfError(result);

          return result.count || 0;
        })
      );

      return {
        bots: counts[0],
        conversations: counts[1],
        messages: counts[2],
        knowledge: counts[3],
        usage: counts[4],
        totalRecords: counts.reduce(
          function (total, value) {
            return total + value;
          },
          0
        )
      };
    },

    async bot(botId) {
      requireValue(botId, "Bot ID");

      const bot = await bots.get(botId);

      if (!bot) {
        throw makeError("Bot not found.");
      }

      const results = await Promise.all([
        conversations.list(botId),
        knowledge.list(botId),
        usage.list(botId)
      ]);

      const conversationRows = results[0];
      const knowledgeRows = results[1];
      const usageRows = results[2];

      return {
        bot: bot,
        conversations: conversationRows.length,
        knowledge: knowledgeRows.length,
        usage: usageRows.length,

        totalInputTokens: usageRows.reduce(
          function (total, item) {
            return total + Number(item.input_tokens || 0);
          },
          0
        ),

        totalOutputTokens: usageRows.reduce(
          function (total, item) {
            return total + Number(item.output_tokens || 0);
          },
          0
        )
      };
    }

  };


  // ==========================================
  // PUBLIC HEXCLØWN API
  // ==========================================

  const HEXCLØWN = {

    version: CONFIG.VERSION,

    config: {
      version: CONFIG.VERSION,
      tables: Object.assign({}, CONFIG.TABLES)
    },

    db: db,

    initialize: initialize,

    getSession: getSession,

    getUser: getUser,

    requireUser: requireUser,

    signIn: signIn,

    signOut: signOut,

    healthCheck: healthCheck,

    bots: bots,

    conversations: conversations,

    messages: messages,

    knowledge: knowledge,

    usage: usage,

    analytics: analytics,

    helpers: {
      createId: createId,
      now: now
    }

  };


  // ==========================================
  // GLOBAL EXPORT
  // ==========================================

  window["HEXCLØWN"] = HEXCLØWN;
  window.HEX = HEXCLØWN;


  // ==========================================
  // START CORE
  // ==========================================

  db()
    .then(function () {
      dispatchEvent("hex:ready", {
        version: CONFIG.VERSION
      });

      console.log(
        "HEXCLØWN Bot Zone Core " +
        CONFIG.VERSION +
        " loaded successfully."
      );
    })
    .catch(function (error) {
      dispatchEvent("hex:error", {
        message: error.message
      });

      console.error(
        "HEXCLØWN Core Error:",
        error
      );
    });

})();
