
/* =====================================================
   HEXCLØWN BOT ZONE CORE
   Version: 5.0.0
   Supabase client and complete Bot Zone API
===================================================== */

(function (window) {
  "use strict";

  const VERSION = "5.0.0";

  const CONFIG = {
    SUPABASE_URL: "https://nddaaqvsnnrdylajpdmp.supabase.co",
    SUPABASE_KEY: "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",

    TABLES: {
      bots: "hexclown_bots",
      conversations: "hexclown_conversations",
      messages: "hexclown_messages",
      knowledge: "hexclown_knowledge",
      usage: "hexclown_usage"
    }
  };

  let client = null;
  let loadingPromise = null;

  function makeError(message, original) {
    const error = new Error(message);
    if (original) error.original = original;
    return error;
  }

  function checkResult(result) {
    if (result && result.error) {
      throw makeError(result.error.message || "Supabase request failed.", result.error);
    }
    return result ? result.data : null;
  }

  function requireValue(value, name) {
    if (value === undefined || value === null || value === "") {
      throw makeError(name + " is required.");
    }
    return value;
  }

  function normalizeRows(data) {
    if (Array.isArray(data)) return data;
    return data ? [data] : [];
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent("hexclown:" + name, {
        detail: detail || {}
      }));
    } catch (error) {
      // Events are optional.
    }
  }

  async function loadLibrary() {
    if (window.supabase && window.supabase.createClient) return;

    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.async = true;

      script.onload = function () {
        if (window.supabase && window.supabase.createClient) {
          resolve();
        } else {
          reject(makeError("Supabase library loaded but createClient is unavailable."));
        }
      };

      script.onerror = function () {
        reject(makeError("Could not load the Supabase JavaScript library. Check your internet connection."));
      };

      document.head.appendChild(script);
    });

    try {
      await loadingPromise;
    } catch (error) {
      loadingPromise = null;
      throw error;
    }
  }

  async function db() {
    if (client) return client;

    await loadLibrary();

    client = window.supabase.createClient(
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

    return client;
  }

  async function getSession() {
    const supabase = await db();
    const result = checkResult(await supabase.auth.getSession());
    return result.session || null;
  }

  async function getUser() {
    const session = await getSession();
    if (!session) return null;

    const supabase = await db();
    const result = checkResult(await supabase.auth.getUser());

    return result.user || null;
  }

  async function requireUser() {
    const user = await getUser();

    if (!user) {
      throw makeError("You must sign in before using HEXCLØWN.");
    }

    return user;
  }

  async function signIn(email, password) {
    requireValue(email, "Email");
    requireValue(password, "Password");

    const supabase = await db();
    const result = checkResult(
      await supabase.auth.signInWithPassword({
        email: String(email).trim(),
        password: password
      })
    );

    dispatch("signed-in", { user: result.user });

    return result;
  }

  async function signOut() {
    const supabase = await db();
    checkResult(await supabase.auth.signOut());

    dispatch("signed-out");
    return { success: true };
  }

  async function initialize() {
    await db();

    const user = await requireUser();

    dispatch("ready", { user: user });

    return {
      success: true,
      user: user,
      version: VERSION
    };
  }

  async function getOwnedRecord(table, id) {
    requireValue(id, "Record ID");

    const user = await requireUser();
    const supabase = await db();

    const data = checkResult(
      await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .eq("owner_id", user.id)
        .maybeSingle()
    );

    return data || null;
  }

  async function listOwnedRecords(table, options) {
    options = options || {};

    const user = await requireUser();
    const supabase = await db();

    let query = supabase
      .from(table)
      .select("*")
      .eq("owner_id", user.id);

    if (options.bot_id) {
      query = query.eq("bot_id", options.bot_id);
    }

    if (options.conversation_id) {
      query = query.eq("conversation_id", options.conversation_id);
    }

    if (options.orderBy) {
      query = query.order(options.orderBy, {
        ascending: options.ascending === true
      });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    if (Number.isInteger(options.limit) && options.limit > 0) {
      query = query.limit(options.limit);
    }

    return normalizeRows(checkResult(await query));
  }

  const bots = {
    async create(data) {
      data = data || {};
      const user = await requireUser();
      const supabase = await db();

      const record = {
        owner_id: user.id,
        name: requireValue(data.name, "Bot name"),
        description: data.description || "",
        category: data.category || "general",
        icon: data.icon || "🤖",
        visibility: data.visibility || "private",
        personality: data.personality || "friendly",
        response_style: data.response_style || "conversational",
        instructions: data.instructions || "",
        welcome_message: data.welcome_message || "",
        conversation_starter: data.conversation_starter || "",
        active: data.active !== false,
        favorite: data.favorite === true,
        settings: data.settings || {},
        updated_at: new Date().toISOString()
      };

      const result = checkResult(
        await supabase
          .from(CONFIG.TABLES.bots)
          .insert(record)
          .select("*")
          .single()
      );

      dispatch("bot-created", { bot: result });
      return result;
    },

    async list(options) {
      return listOwnedRecords(CONFIG.TABLES.bots, options);
    },

    async get(botId) {
      return getOwnedRecord(CONFIG.TABLES.bots, botId);
    },

    async update(botId, updates) {
      requireValue(botId, "Bot ID");
      updates = updates || {};

      const user = await requireUser();
      const supabase = await db();

      const safeUpdates = Object.assign({}, updates);
      delete safeUpdates.id;
      delete safeUpdates.owner_id;
      delete safeUpdates.created_at;

      safeUpdates.updated_at = new Date().toISOString();

      const result = checkResult(
        await supabase
          .from(CONFIG.TABLES.bots)
          .update(safeUpdates)
          .eq("id", botId)
          .eq("owner_id", user.id)
          .select("*")
          .single()
      );

      dispatch("bot-updated", { bot: result });
      return result;
    },

    async delete(botId) {
      requireValue(botId, "Bot ID");

      const user = await requireUser();
      const supabase = await db();

      checkResult(
        await supabase
          .from(CONFIG.TABLES.bots)
          .delete()
          .eq("id", botId)
          .eq("owner_id", user.id)
      );

      dispatch("bot-deleted", { botId: botId });
      return { success: true, id: botId };
    },

    async toggleFavorite(botId, value) {
      const bot = await this.get(botId);
      if (!bot) throw makeError("Bot not found.");

      return this.update(botId, {
        favorite: value === undefined ? !bot.favorite : Boolean(value)
      });
    },

    async toggleActive(botId, value) {
      const bot = await this.get(botId);
      if (!bot) throw makeError("Bot not found.");

      return this.update(botId, {
        active: value === undefined ? !bot.active : Boolean(value)
      });
    }
  };
  
  /* ==========================================
     CONVERSATIONS
  ========================================== */

  const conversations = {
    async create(data) {
      data = data || {};

      const user = await requireUser();
      const supabase = await db();

      const record = {
        owner_id: user.id,
        bot_id: requireValue(data.bot_id, "Bot ID"),
        title: data.title || "New conversation",
        status: data.status || "active",
        updated_at: new Date().toISOString()
      };

      const result = checkResult(
        await supabase
          .from(CONFIG.TABLES.conversations)
          .insert(record)
          .select("*")
          .single()
      );

      dispatch("conversation-created", { conversation: result });
      return result;
    },

    async list(options) {
      return listOwnedRecords(CONFIG.TABLES.conversations, options);
    },

    async get(conversationId) {
      return getOwnedRecord(
        CONFIG.TABLES.conversations,
        conversationId
      );
    },

    async update(conversationId, updates) {
      requireValue(conversationId, "Conversation ID");

      const user = await requireUser();
      const supabase = await db();

      const safeUpdates = Object.assign({}, updates || {});
      delete safeUpdates.id;
      delete safeUpdates.owner_id;
      delete safeUpdates.created_at;

      safeUpdates.updated_at = new Date().toISOString();

      const result = checkResult(
        await supabase
          .from(CONFIG.TABLES.conversations)
          .update(safeUpdates)
          .eq("id", conversationId)
          .eq("owner_id", user.id)
          .select("*")
          .single()
      );

      dispatch("conversation-updated", {
        conversation: result
      });

      return result;
    },

    async delete(conversationId) {
      requireValue(conversationId, "Conversation ID");

      const user = await requireUser();
      const supabase = await db();

      checkResult(
        await supabase
          .from(CONFIG.TABLES.conversations)
          .delete()
          .eq("id", conversationId)
          .eq("owner_id", user.id)
      );

      dispatch("conversation-deleted", {
        conversationId: conversationId
      });

      return { success: true };
    }
  };

  /* ==========================================
     MESSAGES
  ========================================== */

  const messages = {
    async save(data) {
      data = data || {};

      const user = await requireUser();
      const supabase = await db();

      const record = {
        owner_id: user.id,
        conversation_id: requireValue(
          data.conversation_id,
          "Conversation ID"
        ),
        role: requireValue(data.role, "Message role"),
        content: requireValue(data.content, "Message content"),
        metadata: data.metadata || {}
      };

      const result = checkResult(
        await supabase
          .from(CONFIG.TABLES.messages)
          .insert(record)
          .select("*")
          .single()
      );

      dispatch("message-saved", { message: result });
      return result;
    },

    async list(conversationId, options) {
      requireValue(conversationId, "Conversation ID");

      options = Object.assign({}, options || {});
      options.conversation_id = conversationId;
      options.orderBy = "created_at";
      options.ascending = true;

      return listOwnedRecords(
        CONFIG.TABLES.messages,
        options
      );
    },

    async delete(messageId) {
      requireValue(messageId, "Message ID");

      const user = await requireUser();
      const supabase = await db();

      checkResult(
        await supabase
          .from(CONFIG.TABLES.messages)
          .delete()
          .eq("id", messageId)
          .eq("owner_id", user.id)
      );

      return { success: true };
    }
  };

  /* ==========================================
     KNOWLEDGE BASE
  ========================================== */

  const knowledge = {
    async add(data) {
      data = data || {};

      const user = await requireUser();
      const supabase = await db();

      const record = {
        owner_id: user.id,
        bot_id: requireValue(data.bot_id, "Bot ID"),
        title: requireValue(data.title, "Knowledge title"),
        content: requireValue(data.content, "Knowledge content"),
        source_type: data.source_type || "manual",
        metadata: data.metadata || {},
        updated_at: new Date().toISOString()
      };

      const result = checkResult(
        await supabase
          .from(CONFIG.TABLES.knowledge)
          .insert(record)
          .select("*")
          .single()
      );

      dispatch("knowledge-added", {
        knowledge: result
      });

      return result;
    },

    async list(botId, options) {
      options = Object.assign({}, options || {});

      if (botId) options.bot_id = botId;

      return listOwnedRecords(
        CONFIG.TABLES.knowledge,
        options
      );
    },

    async delete(knowledgeId) {
      requireValue(knowledgeId, "Knowledge ID");

      const user = await requireUser();
      const supabase = await db();

      checkResult(
        await supabase
          .from(CONFIG.TABLES.knowledge)
          .delete()
          .eq("id", knowledgeId)
          .eq("owner_id", user.id)
      );

      dispatch("knowledge-deleted", {
        knowledgeId: knowledgeId
      });

      return { success: true };
    }
  };

  /* ==========================================
     USAGE TRACKING
  ========================================== */

  const usage = {
    async record(data) {
      data = data || {};

      const user = await requireUser();
      const supabase = await db();

      const record = {
        owner_id: user.id,
        bot_id: data.bot_id || null,
        conversation_id: data.conversation_id || null,
        provider: data.provider || "local",
        model: data.model || "hexclown-rule-engine",
        request_type: data.request_type || "chat",
        input_tokens: Number(data.input_tokens) || 0,
        output_tokens: Number(data.output_tokens) || 0
      };

      return checkResult(
        await supabase
          .from(CONFIG.TABLES.usage)
          .insert(record)
          .select("*")
          .single()
      );
    },

    async list(options) {
      return listOwnedRecords(
        CONFIG.TABLES.usage,
        options
      );
    },

    async delete(usageId) {
      requireValue(usageId, "Usage ID");

      const user = await requireUser();
      const supabase = await db();

      checkResult(
        await supabase
          .from(CONFIG.TABLES.usage)
          .delete()
          .eq("id", usageId)
          .eq("owner_id", user.id)
      );

      return { success: true };
    }
  };

  /* ==========================================
     ANALYTICS
  ========================================== */

  const analytics = {
    async overview() {
      const results = await Promise.all([
        bots.list(),
        conversations.list(),
        listOwnedRecords(CONFIG.TABLES.messages),
        knowledge.list(),
        usage.list()
      ]);

      const allUsage = results[4];

      return {
        bots: results[0],
        conversations: results[1],
        messages: results[2],
        knowledge: results[3],
        usage: allUsage,

        totalRecords:
          results[0].length +
          results[1].length +
          results[2].length +
          results[3].length +
          results[4].length,

        totalBots: results[0].length,
        totalConversations: results[1].length,
        totalMessages: results[2].length,
        totalKnowledge: results[3].length,
        totalUsage: results[4].length,

        totalInputTokens: allUsage.reduce(
          (sum, item) => sum + (Number(item.input_tokens) || 0),
          0
        ),

        totalOutputTokens: allUsage.reduce(
          (sum, item) => sum + (Number(item.output_tokens) || 0),
          0
        )
      };
    },

    async bot(botId) {
      requireValue(botId, "Bot ID");

      const result = await Promise.all([
        bots.get(botId),
        conversations.list({ bot_id: botId }),
        knowledge.list(botId),
        usage.list({ bot_id: botId })
      ]);

      const botUsage = result[3];

      return {
        bot: result[0],
        conversations: result[1],
        knowledge: result[2],
        usage: botUsage,

        totalInputTokens: botUsage.reduce(
          (sum, item) => sum + (Number(item.input_tokens) || 0),
          0
        ),

        totalOutputTokens: botUsage.reduce(
          (sum, item) => sum + (Number(item.output_tokens) || 0),
          0
        )
      };
    }
  };

  /* ==========================================
     HEALTH CHECK
  ========================================== */

  async function health() {
    try {
      await db();

      return {
        success: true,
        project: "HEXCLØWN",
        service: "Bot Zone Core",
        status: "online",
        version: VERSION
      };
    } catch (error) {
      return {
        success: false,
        status: "offline",
        message: error.message
      };
    }
  }

  /* ==========================================
     CORE EXPORT
  ========================================== */

  const HEX = {
    version: VERSION,
    config: {
      tables: Object.assign({}, CONFIG.TABLES)
    },

    db: db,
    initialize: initialize,
    getSession: getSession,
    getUser: getUser,
    requireUser: requireUser,
    signIn: signIn,
    signOut: signOut,
    health: health,

    bots: bots,
    conversations: conversations,
    messages: messages,
    knowledge: knowledge,
    usage: usage,
    analytics: analytics
  };

  window.HEX = HEX;
  window["HEXCLØWN"] = HEX;

  /* ==========================================
     AUTOMATIC STARTUP
  ========================================== */

  db()
    .then(function () {
      dispatch("core-loaded", {
        success: true,
        version: VERSION
      });

      console.log(
        "HEXCLØWN Core " + VERSION + " loaded successfully."
      );
    })
    .catch(function (error) {
      dispatch("core-error", {
        message: error.message
      });

      console.error(
        "HEXCLØWN Core failed:",
        error
      );
    });

})(window);
               
