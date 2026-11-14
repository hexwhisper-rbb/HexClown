
(function () {
  "use strict";

  const CONFIG = {
    PROJECT_NAME: "HEXCLØWN",
    VERSION: "4.0.0",
    SUPABASE_URL: "https://nddaaqvsnnrdylajpdmp.supabase.co",
    SUPABASE_KEY: "sb_publishable_DVAyBfoG7N50q4x6Vf1YeA_a7mghWFN",
    HEALTH_URL: "https://nddaaqvsnnrdylajpdmp.supabase.co/functions/v1/hexclown-health",
    TABLES: {
      bots: "hexclown_bots",
      conversations: "hexclown_conversations",
      messages: "hexclown_messages",
      knowledge: "hexclown_knowledge",
      usage: "hexclown_usage"
    }
  };

  let supabaseClient = null;
  let databasePromise = null;
  let libraryPromise = null;
  let currentUser = null;
  let initializationPromise = null;

  function makeError(message, original) {
    const error = new Error(message);
    if (original) error.original = original;
    return error;
  }

  function throwIfError(error) {
    if (error) {
      throw makeError(error.message || "Database request failed.", error);
    }
  }

  function normalizeRows(data) {
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  }

  function createId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 3 | 8);
        return v.toString(16);
      }
    );
  }

  function now() {
    return new Date().toISOString();
  }

  function dispatchEvent(name, detail) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, { detail: detail || {} })
      );
    } catch (error) {
      console.warn("HEXCLØWN event error:", error);
    }
  }

  async function loadLibrary() {
    if (window.supabase && window.supabase.createClient) {
      return window.supabase;
    }

    if (libraryPromise) return libraryPromise;

    libraryPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";

      script.async = true;

      script.onload = function () {
        if (window.supabase && window.supabase.createClient) {
          resolve(window.supabase);
        } else {
          reject(makeError("Supabase library loaded but is unavailable."));
        }
      };

      script.onerror = function () {
        libraryPromise = null;
        reject(makeError("Could not load the Supabase library."));
      };

      document.head.appendChild(script);
    });

    return libraryPromise;
  }

  async function db() {
    if (supabaseClient) return supabaseClient;
    if (databasePromise) return databasePromise;

    databasePromise = (async function () {
      const library = await loadLibrary();

      const client = library.createClient(
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

      supabaseClient = client;

      client.auth.onAuthStateChange(function (event, session) {
        currentUser = session ? session.user : null;

        dispatchEvent("hexclown:auth", {
          event: event,
          user: currentUser
        });
      });

      return client;
    })();

    try {
      return await databasePromise;
    } catch (error) {
      databasePromise = null;
      throw error;
    }
  }

  async function getSession() {
    const client = await db();
    const result = await client.auth.getSession();

    throwIfError(result.error);

    return result.data.session || null;
  }

  async function getUser() {
    const client = await db();
    const result = await client.auth.getUser();

    if (result.error) {
      currentUser = null;
      return null;
    }

    currentUser = result.data.user || null;
    return currentUser;
  }

  async function requireUser() {
    const session = await getSession();

    if (!session || !session.access_token) {
      currentUser = null;
      throw makeError("Please sign in to access your Bot Zone account.");
    }

    const user = await getUser();

    if (!user) {
      throw makeError("Your login session is invalid. Please sign in again.");
    }

    return user;
  }

  async function signIn(email, password) {
    if (!email || !password) {
      throw makeError("Enter your email address and password.");
    }

    const client = await db();

    const result = await client.auth.signInWithPassword({
      email: String(email).trim(),
      password: password
    });

    throwIfError(result.error);

    if (!result.data || !result.data.session || !result.data.user) {
      throw makeError(
        "Sign-in did not create a session. Check your account confirmation."
      );
    }

    currentUser = result.data.user;
    return result.data;
  }

  async function signOut() {
    const client = await db();
    const result = await client.auth.signOut();

    throwIfError(result.error);

    currentUser = null;
    return { success: true };
  }

  async function initialize() {
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async function () {
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
    })();

    try {
      return await initializationPromise;
    } catch (error) {
      initializationPromise = null;
      throw error;
    }
  }

  async function healthCheck() {
    try {
      const response = await fetch(CONFIG.HEALTH_URL, {
        method: "GET"
      });

      const data = await response.json();

      return {
        success: response.ok && data.status === "online",
        status: data.status || "unknown",
        data: data
      };
    } catch (error) {
      return {
        success: false,
        status: "offline",
        error: error.message
      };
    }
  }

  async function getOwnedRecord(table, id) {
    const user = await requireUser();
    const client = await db();

    const result = await client
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

    throwIfError(result.error);
    return result.data || null;
  }

  async function listOwnedRecords(table, options) {
    const user = await requireUser();
    const client = await db();

    let query = client
      .from(table)
      .select("*")
      .eq("owner_id", user.id);

    if (options && options.botId) {
      query = query.eq("bot_id", options.botId);
    }

    if (options && options.conversationId) {
      query = query.eq("conversation_id", options.conversationId);
    }

    query = query.order("created_at", { ascending: false });

    if (options && Number.isInteger(options.limit)) {
      query = query.limit(options.limit);
    }

    const result = await query;

    throwIfError(result.error);
    return normalizeRows(result.data);
  }

  // PART 2 CONTINUES BELOW
   
  // ==========================================
  // PART 2 — BOT MANAGEMENT
  // ==========================================

  const bots = {

    async create(botData) {
      const user = await requireUser();
      const client = await db();

      if (!botData || !botData.name) {
        throw makeError("A bot name is required.");
      }

      const record = {
        owner_id: user.id,
        name: String(botData.name).trim(),
        description: botData.description || "",
        category: botData.category || "General",
        icon: botData.icon || "🤖",
        visibility: botData.visibility || "private",
        personality: botData.personality || "",
        response_style: botData.response_style || "friendly",
        instructions: botData.instructions || "",
        welcome_message: botData.welcome_message || "",
        conversation_starter: botData.conversation_starter || "",
        active: botData.active !== false,
        favorite: false,
        settings: botData.settings || {},
        created_at: now(),
        updated_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.bots)
        .insert(record)
        .select("*")
        .single();

      throwIfError(result.error);
      return result.data;
    },

    async list(options) {
      return await listOwnedRecords(
        CONFIG.TABLES.bots,
        options || {}
      );
    },

    async get(id) {
      return await getOwnedRecord(
        CONFIG.TABLES.bots,
        id
      );
    },

    async update(id, changes) {
      await requireUser();

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
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          updateData[key] = changes[key];
        }
      });

      updateData.updated_at = now();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.bots)
        .update(updateData)
        .eq("id", id)
        .select("*")
        .single();

      throwIfError(result.error);
      return result.data;
    },

    async delete(id) {
      await requireUser();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.bots)
        .delete()
        .eq("id", id)
        .select("id");

      throwIfError(result.error);

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

    async create(botId, title) {
      const user = await requireUser();
      const client = await db();

      const bot = await bots.get(botId);

      if (!bot) {
        throw makeError("The selected bot does not exist.");
      }

      const record = {
        owner_id: user.id,
        bot_id: botId,
        title: title || "New conversation",
        status: "active",
        created_at: now(),
        updated_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.conversations)
        .insert(record)
        .select("*")
        .single();

      throwIfError(result.error);
      return result.data;
    },

    async list(botId) {
      const user = await requireUser();
      const client = await db();

      let query = client
        .from(CONFIG.TABLES.conversations)
        .select("*")
        .eq("owner_id", user.id);

      if (botId) {
        query = query.eq("bot_id", botId);
      }

      const result = await query.order(
        "updated_at",
        { ascending: false }
      );

      throwIfError(result.error);
      return normalizeRows(result.data);
    },

    async get(id) {
      return await getOwnedRecord(
        CONFIG.TABLES.conversations,
        id
      );
    },

    async update(id, changes) {
      await requireUser();

      const updateData = {};

      if (Object.prototype.hasOwnProperty.call(changes, "title")) {
        updateData.title = changes.title;
      }

      if (Object.prototype.hasOwnProperty.call(changes, "status")) {
        updateData.status = changes.status;
      }

      updateData.updated_at = now();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.conversations)
        .update(updateData)
        .eq("id", id)
        .select("*")
        .single();

      throwIfError(result.error);
      return result.data;
    },

    async delete(id) {
      await requireUser();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.conversations)
        .delete()
        .eq("id", id)
        .select("id");

      throwIfError(result.error);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }
  };

  console.info("HEXCLØWN CORE PART 2 READY");

  // PART 3 CONTINUES BELOW
         
  // ==========================================
  // PART 3 — MESSAGE MANAGEMENT
  // ==========================================

  const messages = {

    async save(conversationId, role, content, metadata) {
      const user = await requireUser();
      const client = await db();

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

      const result = await client
        .from(CONFIG.TABLES.messages)
        .insert(record)
        .select("*")
        .single();

      throwIfError(result.error);

      await conversations.update(conversationId, {
        status: "active"
      });

      return result.data;
    },

    async list(conversationId) {
      await requireUser();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.messages)
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      throwIfError(result.error);
      return normalizeRows(result.data);
    },

    async delete(id) {
      await requireUser();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.messages)
        .delete()
        .eq("id", id)
        .select("id");

      throwIfError(result.error);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }
  };


  // ==========================================
  // PART 3 — KNOWLEDGE MANAGEMENT
  // ==========================================

  const knowledge = {

    async add(botId, title, content, metadata) {
      const user = await requireUser();
      const client = await db();

      const bot = await bots.get(botId);

      if (!bot) {
        throw makeError("Bot not found.");
      }

      if (!title || !content) {
        throw makeError("Knowledge title and content are required.");
      }

      const record = {
        owner_id: user.id,
        bot_id: botId,
        title: String(title),
        content: String(content),
        source_type: "manual",
        metadata: metadata || {},
        created_at: now(),
        updated_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.knowledge)
        .insert(record)
        .select("*")
        .single();

      throwIfError(result.error);
      return result.data;
    },

    async list(botId) {
      const user = await requireUser();
      const client = await db();

      let query = client
        .from(CONFIG.TABLES.knowledge)
        .select("*")
        .eq("owner_id", user.id);

      if (botId) {
        query = query.eq("bot_id", botId);
      }

      const result = await query.order(
        "created_at",
        { ascending: false }
      );

      throwIfError(result.error);
      return normalizeRows(result.data);
    },

    async delete(id) {
      await requireUser();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.knowledge)
        .delete()
        .eq("id", id)
        .select("id");

      throwIfError(result.error);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }
  };


  // ==========================================
  // PART 3 — USAGE TRACKING
  // ==========================================

  const usage = {

    async record(recordData) {
      const user = await requireUser();
      const client = await db();

      const data = recordData || {};

      const record = {
        owner_id: user.id,
        bot_id: data.bot_id || null,
        conversation_id: data.conversation_id || null,
        provider: data.provider || "local",
        model: data.model || "rule-based",
        request_type: data.request_type || "message",
        input_tokens: Number(data.input_tokens) || 0,
        output_tokens: Number(data.output_tokens) || 0,
        created_at: now()
      };

      const result = await client
        .from(CONFIG.TABLES.usage)
        .insert(record)
        .select("*")
        .single();

      throwIfError(result.error);
      return result.data;
    },

    async list(botId) {
      const user = await requireUser();
      const client = await db();

      let query = client
        .from(CONFIG.TABLES.usage)
        .select("*")
        .eq("owner_id", user.id);

      if (botId) {
        query = query.eq("bot_id", botId);
      }

      const result = await query.order(
        "created_at",
        { ascending: false }
      );

      throwIfError(result.error);
      return normalizeRows(result.data);
    },

    async delete(id) {
      await requireUser();

      const client = await db();

      const result = await client
        .from(CONFIG.TABLES.usage)
        .delete()
        .eq("id", id)
        .select("id");

      throwIfError(result.error);

      return {
        success: true,
        deleted: normalizeRows(result.data).length
      };
    }
  };


  // ==========================================
  // PART 3 — ANALYTICS
  // ==========================================

  const analytics = {

    async overview() {
      const user = await requireUser();
      const client = await db();

      const results = await Promise.all([
        client.from(CONFIG.TABLES.bots)
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id),

        client.from(CONFIG.TABLES.conversations)
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id),

        client.from(CONFIG.TABLES.messages)
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id),

        client.from(CONFIG.TABLES.knowledge)
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id),

        client.from(CONFIG.TABLES.usage)
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id)
      ]);

      results.forEach(function (result) {
        throwIfError(result.error);
      });

      return {
        bots: results[0].count || 0,
        conversations: results[1].count || 0,
        messages: results[2].count || 0,
        knowledge: results[3].count || 0,
        requests: results[4].count || 0
      };
    },

    async bot(botId) {
      const bot = await bots.get(botId);

      if (!bot) {
        throw makeError("Bot not found.");
      }

      const [conversationRows, knowledgeRows, usageRows] =
        await Promise.all([
          conversations.list(botId),
          knowledge.list(botId),
          usage.list(botId)
        ]);

      return {
        bot: bot,
        conversations: conversationRows.length,
        knowledge: knowledgeRows.length,
        requests: usageRows.length,
        input_tokens: usageRows.reduce(
          (total, item) => total + (Number(item.input_tokens) || 0),
          0
        ),
        output_tokens: usageRows.reduce(
          (total, item) => total + (Number(item.output_tokens) || 0),
          0
        )
      };
    }
  };

  console.info("HEXCLØWN CORE PART 3 READY");

  // PART 4 CONTINUES BELOW
         
  // ==========================================
  // PART 4 — PUBLIC API
  // ==========================================

  const HEXCLØWN = {

    name: CONFIG.PROJECT_NAME,
    version: CONFIG.VERSION,

    config: {
      project: CONFIG.PROJECT_NAME,
      version: CONFIG.VERSION,
      supabaseUrl: CONFIG.SUPABASE_URL
    },

    // DATABASE
    db: db,
    initialize: initialize,
    healthCheck: healthCheck,

    // AUTHENTICATION
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getUser: getUser,
    requireUser: requireUser,

    // BOT SYSTEM
    bots: bots,

    // CONVERSATIONS
    conversations: conversations,

    // MESSAGES
    messages: messages,

    // KNOWLEDGE
    knowledge: knowledge,

    // USAGE
    usage: usage,

    // ANALYTICS
    analytics: analytics,

    // UTILITIES
    utils: {
      createId: createId,
      now: now,
      normalizeRows: normalizeRows
    },

    get status() {
      return {
        ready: !!supabaseClient,
        authenticated: !!currentUser,
        user: currentUser,
        version: CONFIG.VERSION
      };
    }
  };


  // ==========================================
  // GLOBAL EXPORTS
  // ==========================================

  window["HEXCLØWN"] = HEXCLØWN;
  window.HEX = HEXCLØWN;


  // ==========================================
  // START CORE
  // ==========================================

  async function startCore() {
    try {
      await db();

      dispatchEvent("hexclown:ready", {
        success: true,
        version: CONFIG.VERSION
      });

      console.info(
        "HEXCLØWN BOT ZONE CORE",
        CONFIG.VERSION,
        "READY"
      );

    } catch (error) {

      console.error(
        "HEXCLØWN CORE INITIALIZATION FAILED:",
        error
      );

      dispatchEvent("hexclown:error", {
        message: error.message
      });
    }
  }

  startCore();

})();
